// FILE: grokSessionImages.ts
// Purpose: Resolves Grok Build's session-relative markdown image paths
//          (`images/N.jpg`) onto files under ${GROK_HOME:-~/.grok}/sessions.
// Layer: Server utility
// Exports: grok home/sessions roots and relative-image lookup

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isSupportedLocalImagePath } from "@luminor/shared/localPreviewFiles";

export function resolveGrokHomePath(): string {
  const fromEnv = process.env.GROK_HOME?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.join(os.homedir(), ".grok");
}

export function resolveGrokSessionsRoot(): string {
  return path.join(resolveGrokHomePath(), "sessions");
}

export function isGrokSessionRelativeImageSrc(src: string): boolean {
  const normalized = src.trim().replaceAll("\\", "/");
  if (!normalized.startsWith("images/")) {
    return false;
  }
  const fileName = normalized.slice("images/".length);
  if (!fileName || fileName.includes("/") || fileName === "." || fileName === "..") {
    return false;
  }
  if (fileName.startsWith(".") || fileName.includes("\0")) {
    return false;
  }
  return isSupportedLocalImagePath(fileName);
}

function grokSessionImageFileName(src: string): string {
  return src.trim().replaceAll("\\", "/").slice("images/".length);
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function cwdLookupKeys(cwd: string): string[] {
  const keys = new Set<string>();
  const trimmed = cwd.trim();
  if (trimmed.length === 0) {
    return [];
  }
  keys.add(trimmed);
  keys.add(path.resolve(trimmed));
  return [...keys];
}

export async function resolveGrokSessionRelativeImage(input: {
  readonly requestedPath: string;
  readonly cwd: string | null | undefined;
}): Promise<string | null> {
  if (!isGrokSessionRelativeImageSrc(input.requestedPath)) {
    return null;
  }
  const cwd = input.cwd?.trim();
  if (!cwd) {
    return null;
  }
  const fileName = grokSessionImageFileName(input.requestedPath);
  const sessionsRoot = resolveGrokSessionsRoot();
  let realSessionsRoot: string;
  try {
    realSessionsRoot = await fs.realpath(sessionsRoot);
  } catch {
    return null;
  }

  const hits: { path: string; mtimeMs: number }[] = [];
  const seenParents = new Set<string>();
  for (const key of cwdLookupKeys(cwd)) {
    const sessionParent = path.join(sessionsRoot, encodeURIComponent(key));
    let realParent: string;
    try {
      realParent = await fs.realpath(sessionParent);
    } catch {
      continue;
    }
    if (seenParents.has(realParent) || !isPathInside(realParent, realSessionsRoot)) {
      continue;
    }
    seenParents.add(realParent);
    const entries = await fs.readdir(realParent, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const imagePath = path.join(realParent, entry.name, "images", fileName);
      const stat = await fs.stat(imagePath).catch(() => null);
      if (!stat?.isFile()) {
        continue;
      }
      hits.push({ path: imagePath, mtimeMs: stat.mtimeMs });
    }
  }

  if (hits.length === 0) {
    return null;
  }
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return hits[0]?.path ?? null;
}
