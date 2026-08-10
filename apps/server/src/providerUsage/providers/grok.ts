// FILE: providerUsage/providers/grok.ts
// Purpose: Live Grok usage fetcher. Reads the Grok CLI OAuth session from
// ${GROK_HOME:-~/.grok}/auth.json read-only and calls the xAI CLI chat proxy billing endpoint,
// mapping weekly credit usage (or the monthly spend fallback) into usage windows. The Grok CLI
// owns token refresh; a stale token surfaces as "sign in again" instead of being refreshed here.
// Ported from Orca (https://github.com/stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc.).

import nodePath from "node:path";

import type { ServerProviderUsageLimit, ServerProviderUsageSnapshot } from "@luminor/contracts";

import { readJsonFile } from "../credentials";
import { fetchJson, isAuthFailureStatus } from "../http";
import {
  asFiniteNumber,
  asRecord,
  asString,
  buildSnapshot,
  clampPercent,
  errorSnapshot,
  isoFromString,
  needsAuthSnapshot,
} from "../parse";
import type { ProviderUsageContext, ProviderUsageFetcher } from "../types";

const SOURCE = "grok-cli-billing";
const DEFAULT_PROXY_BASE_URL = "https://cli-chat-proxy.grok.com/v1";
const CLI_AUTH_HEADER_VALUE = "xai-grok-cli";
const PREFERRED_ISSUER = "https://auth.x.ai";
const WEEKLY_WINDOW_MINUTES = 10_080;
const MONTHLY_WINDOW_MINUTES = 43_200;
const WEEKLY_PERIOD_TYPE = "USAGE_PERIOD_TYPE_WEEKLY";

interface GrokSession {
  accessToken: string;
  expiresAtMs: number | undefined;
  userId: string | undefined;
}

function proxyBaseUrl(ctx: ProviderUsageContext): string {
  const override = asString(ctx.env.GROK_CLI_CHAT_PROXY_BASE_URL);
  return (override ?? DEFAULT_PROXY_BASE_URL).replace(/\/$/u, "");
}

function grokHomeDir(ctx: ProviderUsageContext): string {
  return asString(ctx.env.GROK_HOME) ?? nodePath.join(ctx.homeDir, ".grok");
}

function readSession(entry: unknown): GrokSession | null {
  const record = asRecord(entry);
  const accessToken = asString(record?.key);
  if (!accessToken) {
    return null;
  }
  const expiresAt = asString(record?.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return {
    accessToken,
    expiresAtMs: Number.isNaN(expiresAtMs) ? undefined : expiresAtMs,
    userId: asString(record?.user_id),
  };
}

function isFresh(session: GrokSession, nowMs: number): boolean {
  return session.expiresAtMs === undefined || session.expiresAtMs > nowMs;
}

/**
 * Pick the session to use out of the issuer-keyed auth.json map: a fresh entry from the Grok
 * issuer wins, then any fresh entry, then a stale preferred entry (so the caller can tell the
 * user to sign in again rather than reporting "not signed in").
 */
export function selectGrokSession(
  authFile: unknown,
  nowMs: number,
): { session: GrokSession; isFresh: boolean } | null {
  const record = asRecord(authFile);
  if (!record) {
    return null;
  }
  let preferredStale: GrokSession | null = null;
  let anyStale: GrokSession | null = null;
  let anyFresh: GrokSession | null = null;

  for (const [key, value] of Object.entries(record)) {
    const session = readSession(value);
    if (!session) {
      continue;
    }
    const isPreferredIssuer = key === PREFERRED_ISSUER || key.startsWith(`${PREFERRED_ISSUER}::`);
    const fresh = isFresh(session, nowMs);
    if (fresh && isPreferredIssuer) {
      return { session, isFresh: true };
    }
    if (fresh) {
      anyFresh ??= session;
    } else if (isPreferredIssuer) {
      preferredStale ??= session;
    } else {
      anyStale ??= session;
    }
  }

  if (anyFresh) {
    return { session: anyFresh, isFresh: true };
  }
  const stale = preferredStale ?? anyStale;
  return stale ? { session: stale, isFresh: false } : null;
}

function billingHeaders(session: GrokSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-XAI-Token-Auth": CLI_AUTH_HEADER_VALUE,
    Accept: "application/json",
    ...(session.userId ? { "x-userid": session.userId } : {}),
  };
}

function billingConfig(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload);
  return asRecord(root?.config) ?? root;
}

/**
 * The proxy omits `creditUsagePercent` when it is zero (protobuf default), so a response that
 * otherwise describes the current weekly period means 0% used rather than "no data".
 */
function hasConfirmedWeeklyPeriod(config: Record<string, unknown>): boolean {
  const currentPeriod = asRecord(config.currentPeriod);
  if (asString(currentPeriod?.type) !== WEEKLY_PERIOD_TYPE) {
    return false;
  }
  const periodStart = asString(currentPeriod?.start);
  const periodEnd = asString(currentPeriod?.end);
  return (
    periodStart !== undefined &&
    periodEnd !== undefined &&
    periodStart === asString(config.billingPeriodStart) &&
    periodEnd === asString(config.billingPeriodEnd)
  );
}

export function parseGrokWeeklyCredits(payload: unknown): ServerProviderUsageLimit | null {
  const config = billingConfig(payload);
  if (!config) {
    return null;
  }
  const rawUsedPercent = asFiniteNumber(config.creditUsagePercent);
  const usedPercent =
    rawUsedPercent === undefined
      ? hasConfirmedWeeklyPeriod(config)
        ? 0
        : undefined
      : clampPercent(rawUsedPercent);
  if (usedPercent === undefined) {
    return null;
  }
  const currentPeriod = asRecord(config.currentPeriod);
  const resetsAt =
    isoFromString(currentPeriod?.end) ?? isoFromString(config.billingPeriodEnd) ?? undefined;
  return {
    window: "Weekly",
    usedPercent,
    windowDurationMins: WEEKLY_WINDOW_MINUTES,
    ...(resetsAt ? { resetsAt } : {}),
  };
}

function moneyAmount(value: unknown): number | undefined {
  const record = asRecord(value);
  return asFiniteNumber(record ? record.val : value);
}

export function parseGrokMonthlyUsage(payload: unknown): ServerProviderUsageLimit | null {
  const config = billingConfig(payload);
  if (!config) {
    return null;
  }
  const limit = moneyAmount(config.monthlyLimit);
  const used = moneyAmount(config.used);
  if (limit === undefined || limit <= 0 || used === undefined) {
    return null;
  }
  const usedPercent = clampPercent((used / limit) * 100);
  if (usedPercent === undefined) {
    return null;
  }
  const resetsAt = isoFromString(config.billingPeriodEnd) ?? undefined;
  return {
    window: "Monthly",
    usedPercent,
    windowDurationMins: MONTHLY_WINDOW_MINUTES,
    ...(resetsAt ? { resetsAt } : {}),
  };
}

function staleSessionSnapshot(nowMs: number): ServerProviderUsageSnapshot {
  return buildSnapshot({
    provider: "grok",
    nowMs,
    status: "needs-auth",
    source: SOURCE,
    detail: "Grok sign-in expired — run `grok` to sign in again.",
  });
}

export const grokUsageFetcher: ProviderUsageFetcher = {
  provider: "grok",
  async fetch(ctx) {
    const authPath = nodePath.join(grokHomeDir(ctx), "auth.json");
    const authFile = await readJsonFile(authPath);
    if (authFile === null) {
      return needsAuthSnapshot("grok", ctx.nowMs, SOURCE);
    }
    const selected = selectGrokSession(authFile, ctx.nowMs);
    if (!selected) {
      // Never echo the resolved path or a custom GROK_HOME — it can carry the local username.
      return errorSnapshot("grok", ctx.nowMs, SOURCE, "Could not read the Grok CLI credentials.");
    }
    if (!selected.isFresh) {
      return staleSessionSnapshot(ctx.nowMs);
    }

    const baseUrl = proxyBaseUrl(ctx);
    const creditsUrl = `${baseUrl}/billing?format=credits`;
    const allowedOrigins = [new URL(baseUrl).origin];
    const headers = billingHeaders(selected.session);

    try {
      const creditsResult = await fetchJson({
        service: "provider-usage-grok",
        url: creditsUrl,
        allowedOrigins,
        headers,
      });
      if (isAuthFailureStatus(creditsResult.status)) {
        return staleSessionSnapshot(ctx.nowMs);
      }
      if (!creditsResult.ok) {
        return errorSnapshot(
          "grok",
          ctx.nowMs,
          SOURCE,
          `Grok usage request failed (${creditsResult.status}).`,
        );
      }

      const weekly = parseGrokWeeklyCredits(creditsResult.json);
      if (weekly) {
        return buildSnapshot({
          provider: "grok",
          nowMs: ctx.nowMs,
          status: "ok",
          source: SOURCE,
          limits: [weekly],
        });
      }

      const monthlyResult = await fetchJson({
        service: "provider-usage-grok",
        url: `${baseUrl}/billing`,
        allowedOrigins,
        headers,
      });
      const monthly = monthlyResult.ok ? parseGrokMonthlyUsage(monthlyResult.json) : null;
      // A signed-in account without a readable quota is simply hidden; painting an error would
      // leave a permanent alert on an otherwise healthy account.
      return buildSnapshot({
        provider: "grok",
        nowMs: ctx.nowMs,
        status: monthly ? "ok" : "unsupported",
        source: SOURCE,
        ...(monthly ? { limits: [monthly] } : { detail: "Grok did not report a usage quota." }),
      });
    } catch {
      return errorSnapshot("grok", ctx.nowMs, SOURCE, "Could not reach the Grok usage service.");
    }
  },
};
