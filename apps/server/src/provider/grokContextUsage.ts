// FILE: grokContextUsage.ts
// Purpose: Parse Grok occupancy from session/usage or signals.json into a context-window snapshot.
// Layer: Server provider utility

import { homedir } from "node:os";
import nodePath from "node:path";
import type { ThreadTokenUsageSnapshot } from "@luminor/contracts";
import { clampUsagePercent, computeUsagePercent, nonNegativeInteger } from "./tokenUsage.ts";

const GROK_SESSIONS_DIR = "sessions";
const GROK_SIGNALS_FILE = "signals.json";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstInteger(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const parsed = nonNegativeInteger(record[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function occupancyRecord(raw: unknown): Record<string, unknown> | undefined {
  const record = asRecord(raw);
  if (!record) {
    return undefined;
  }
  const nested = asRecord(record.usage) ?? asRecord(record.signals) ?? asRecord(record.result);
  return nested ?? record;
}

export function parseGrokContextOccupancy(raw: unknown): ThreadTokenUsageSnapshot | undefined {
  const record = occupancyRecord(raw);
  const usedTokens = firstInteger(record, [
    "contextTokensUsed",
    "tokensUsed",
    "tokens_used",
    "used",
  ]);
  const maxTokens = firstInteger(record, [
    "contextWindowTokens",
    "context_window_tokens",
    "contextWindow",
    "context_window",
    "size",
  ]);
  const reportedPercent = clampUsagePercent(
    firstInteger(record, ["contextWindowUsage", "contextUsagePct", "context_usage_pct"]) ??
      record?.contextWindowUsage ??
      record?.contextUsagePct ??
      record?.context_usage_pct,
  );
  const usedPercent =
    reportedPercent !== undefined && reportedPercent > 0
      ? reportedPercent
      : computeUsagePercent(usedTokens ?? 0, maxTokens);

  const hasUsedTokens = usedTokens !== undefined && usedTokens > 0;
  const hasUsedPercent = usedPercent !== undefined && usedPercent > 0;
  if (!hasUsedTokens && !hasUsedPercent) {
    return undefined;
  }

  return {
    usedTokens: usedTokens ?? 0,
    ...(usedPercent !== undefined ? { usedPercent } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    compactsAutomatically: true,
  };
}

export function grokContextOccupancyKey(usage: ThreadTokenUsageSnapshot): string {
  return `${usage.usedTokens}:${usage.maxTokens ?? ""}:${usage.usedPercent ?? ""}`;
}

export function encodeGrokSessionCwdSegment(cwd: string): string {
  return encodeURIComponent(cwd);
}

export function grokHomeCandidates(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
}): string[] {
  const homes: string[] = [];
  const fromEnv = input.env?.GROK_HOME?.trim();
  if (fromEnv) {
    homes.push(fromEnv);
  }
  homes.push(nodePath.join(homedir(), ".grok"));
  const configuredHome = input.homeDir?.trim();
  if (configuredHome) {
    homes.push(nodePath.join(configuredHome, ".grok"));
  }
  return [...new Set(homes)];
}

export function grokSessionSignalsPathCandidates(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
  readonly cwd: string;
  readonly sessionId: string;
}): string[] {
  const encodedCwd = encodeGrokSessionCwdSegment(input.cwd);
  const sessionId = input.sessionId.trim();
  if (!encodedCwd || !sessionId) {
    return [];
  }
  return grokHomeCandidates(input).map((home) =>
    nodePath.join(home, GROK_SESSIONS_DIR, encodedCwd, sessionId, GROK_SIGNALS_FILE),
  );
}
