// FILE: chatImageSnapshots.ts
// Purpose: Snapshots agent-referenced chat images into Luminor-owned storage at
//          message ingestion so previews survive worktree cleanup, provider
//          session pruning, and references outside the live-serving allowlist.
// Layer: Server utility
// Exports: snapshot root/naming, markdown image extraction, snapshot capture, and
//          serve-time snapshot lookup
// Depends on: node fs/crypto, shared preview-file allowlist, Grok session images

import crypto from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isSupportedLocalImagePath } from "@luminor/shared/localPreviewFiles";

import { resolveGrokSessionRelativeImage } from "./grokSessionImages.ts";

export const CHAT_IMAGE_SNAPSHOTS_DIRNAME = "chat-image-snapshots";

// Chat-referenced images are screenshots or generated pictures; the cap only
// refuses files that clearly are not one of them.
export const MAX_CHAT_IMAGE_SNAPSHOT_BYTES = 64 * 1024 * 1024;

const DEFAULT_SNAPSHOT_RETRY = { attempts: 5, delayMs: 2_000 } as const;

export interface ChatImageSnapshotRetryPolicy {
  readonly attempts: number;
  readonly delayMs: number;
}

export interface ChatImageSnapshotOutcome {
  readonly copied: readonly string[];
  readonly alreadySnapshotted: readonly string[];
  readonly unavailable: readonly string[];
}

export interface ResolvedChatImageSnapshot {
  readonly path: string;
  readonly fileName: string;
  readonly sizeBytes: number;
}

export function resolveChatImageSnapshotsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const runtimeHome = env.LUMINOR_HOME?.trim();
  const root = runtimeHome || path.join(os.homedir(), ".luminor", "runtime");
  return path.join(root, CHAT_IMAGE_SNAPSHOTS_DIRNAME);
}

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((<[^>]*>|[^)]+)\)/g;

/**
 * Mirrors the web client's `normalizeMarkdownImagePath` so snapshot keys written
 * at ingestion match the `path` query the preview route later receives.
 */
function normalizeMarkdownImageTarget(rawTarget: string): string | null {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  } else {
    const firstWhitespace = target.search(/\s/);
    if (firstWhitespace >= 0) {
      target = target.slice(0, firstWhitespace);
    }
  }
  if (!target) {
    return null;
  }
  if (target.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(target).pathname);
    } catch {
      return target;
    }
  }
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function isLocalImageSrc(src: string): boolean {
  if (src.includes("\0") || !isSupportedLocalImagePath(src)) {
    return false;
  }
  return (
    src.startsWith("/") ||
    src.startsWith("./") ||
    src.startsWith("../") ||
    !/^[a-z][a-z0-9+.-]*:/i.test(src)
  );
}

export function extractLocalImageSrcsFromMarkdown(text: string): string[] {
  const sources = new Set<string>();
  for (const match of text.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const target = match[1] === undefined ? null : normalizeMarkdownImageTarget(match[1]);
    if (target && isLocalImageSrc(target)) {
      sources.add(target);
    }
  }
  return [...sources];
}

/**
 * Deterministic snapshot name for one markdown image reference: the same
 * (src, cwd) pair yields the same name at capture time and at serve time.
 * Relative references canonicalize against the thread workspace cwd, so the
 * key stays stable even when the referenced file never existed there (Grok's
 * session-relative `images/N.jpg` markdown).
 */
export function chatImageSnapshotFileName(input: {
  readonly src: string;
  readonly cwd: string | null | undefined;
}): string | null {
  const src = input.src.trim();
  if (!src || !isLocalImageSrc(src)) {
    return null;
  }
  const canonicalPath = path.isAbsolute(src)
    ? path.normalize(src)
    : path.resolve(input.cwd?.trim() || "/", src);
  const hash = crypto.createHash("sha256").update(canonicalPath).digest("hex");
  return `${hash}${path.extname(canonicalPath).toLowerCase()}`;
}

async function resolveSnapshotSourceFile(input: {
  readonly src: string;
  readonly cwd: string | null | undefined;
}): Promise<string | null> {
  const cwd = input.cwd?.trim();
  const candidates: string[] = [];
  if (path.isAbsolute(input.src)) {
    candidates.push(path.normalize(input.src));
  } else if (cwd) {
    candidates.push(path.resolve(cwd, input.src));
  }
  const grokSessionPath = await resolveGrokSessionRelativeImage({
    requestedPath: input.src,
    cwd,
  });
  if (grokSessionPath) {
    candidates.push(grokSessionPath);
  }

  for (const candidate of candidates) {
    let realPath: string;
    try {
      realPath = await fs.realpath(candidate);
    } catch {
      continue;
    }
    if (!isSupportedLocalImagePath(realPath)) {
      continue;
    }
    const info = await fs.stat(realPath).catch(() => null);
    if (!info?.isFile() || info.size > MAX_CHAT_IMAGE_SNAPSHOT_BYTES) {
      continue;
    }
    return realPath;
  }
  return null;
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

/**
 * Fully writes a hidden temp copy first, then claims the final name with
 * link(2), which fails with EEXIST instead of overwriting: the first snapshot
 * of a reference wins, so replays never mutate an already captured image.
 */
async function copySnapshotExclusively(sourcePath: string, destinationPath: string): Promise<void> {
  const temporaryPath = `${destinationPath}.tmp-${crypto.randomUUID()}`;
  await fs.copyFile(sourcePath, temporaryPath, fileSystemConstants.COPYFILE_EXCL);
  try {
    await fs.link(temporaryPath, destinationPath);
  } catch (error) {
    if (!isErrorWithCode(error, "EEXIST")) {
      throw error;
    }
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

export async function snapshotChatImageSources(input: {
  readonly sources: readonly string[];
  readonly cwd: string | null | undefined;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ChatImageSnapshotOutcome> {
  const snapshotsRoot = resolveChatImageSnapshotsRoot(input.env);
  const copied: string[] = [];
  const alreadySnapshotted: string[] = [];
  const unavailable: string[] = [];

  for (const src of new Set(input.sources)) {
    const fileName = chatImageSnapshotFileName({ src, cwd: input.cwd });
    if (!fileName) {
      continue;
    }
    const destinationPath = path.join(snapshotsRoot, fileName);
    const existing = await fs.stat(destinationPath).catch(() => null);
    if (existing?.isFile()) {
      alreadySnapshotted.push(src);
      continue;
    }
    const sourcePath = await resolveSnapshotSourceFile({ src, cwd: input.cwd });
    if (!sourcePath) {
      unavailable.push(src);
      continue;
    }
    await fs.mkdir(snapshotsRoot, { recursive: true });
    await copySnapshotExclusively(sourcePath, destinationPath);
    copied.push(src);
  }

  return { copied, alreadySnapshotted, unavailable };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Providers can emit the message before the referenced file hits disk, so
 * sources that are still unavailable get retried on a short spaced schedule
 * before being given up on.
 */
export async function snapshotChatImageSourcesWithRetry(input: {
  readonly sources: readonly string[];
  readonly cwd: string | null | undefined;
  readonly env?: NodeJS.ProcessEnv;
  readonly retry?: ChatImageSnapshotRetryPolicy;
}): Promise<ChatImageSnapshotOutcome> {
  const retry = input.retry ?? DEFAULT_SNAPSHOT_RETRY;
  const copied: string[] = [];
  const alreadySnapshotted: string[] = [];
  let pending: readonly string[] = input.sources;

  for (let attempt = 1; attempt <= Math.max(1, retry.attempts); attempt += 1) {
    const outcome = await snapshotChatImageSources({
      sources: pending,
      cwd: input.cwd,
      ...(input.env ? { env: input.env } : {}),
    });
    copied.push(...outcome.copied);
    alreadySnapshotted.push(...outcome.alreadySnapshotted);
    pending = outcome.unavailable;
    if (pending.length === 0 || attempt >= retry.attempts) {
      break;
    }
    await sleep(retry.delayMs);
  }

  return { copied, alreadySnapshotted, unavailable: pending };
}

export async function snapshotChatImagesFromMarkdown(input: {
  readonly text: string;
  readonly cwd: string | null | undefined;
  readonly env?: NodeJS.ProcessEnv;
  readonly retry?: ChatImageSnapshotRetryPolicy;
}): Promise<ChatImageSnapshotOutcome> {
  const sources = extractLocalImageSrcsFromMarkdown(input.text);
  if (sources.length === 0) {
    return { copied: [], alreadySnapshotted: [], unavailable: [] };
  }
  return snapshotChatImageSourcesWithRetry({
    sources,
    cwd: input.cwd,
    ...(input.env ? { env: input.env } : {}),
    ...(input.retry ? { retry: input.retry } : {}),
  });
}

/**
 * Serve-time lookup for the preview route: returns the captured snapshot for a
 * markdown image reference that can no longer (or never could) be served from
 * the live allowlisted roots.
 */
export async function resolveChatImageSnapshot(input: {
  readonly requestedPath: string;
  readonly cwd: string | null | undefined;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ResolvedChatImageSnapshot | null> {
  const fileName = chatImageSnapshotFileName({ src: input.requestedPath, cwd: input.cwd });
  if (!fileName) {
    return null;
  }
  const snapshotPath = path.join(resolveChatImageSnapshotsRoot(input.env), fileName);
  const info = await fs.stat(snapshotPath).catch(() => null);
  if (!info?.isFile()) {
    return null;
  }
  return {
    path: snapshotPath,
    fileName: path.basename(input.requestedPath.trim().replaceAll("\\", "/")),
    sizeBytes: info.size,
  };
}
