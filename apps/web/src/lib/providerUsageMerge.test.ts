import { describe, expect, it } from "vitest";
import type {
  ProviderKind,
  ProviderUsageStatus,
  ServerProviderUsageLimit,
  ServerProviderUsageLine,
  ServerProviderUsageSnapshot,
} from "@luminor/contracts";

import { mergeProviderUsage } from "~/lib/providerUsageMerge";

const UPDATED_AT = "2026-08-10T12:00:00.000Z";

function snapshot(input: {
  provider?: ProviderKind;
  status?: ProviderUsageStatus;
  detail?: string;
  limits?: ServerProviderUsageLimit[];
  usageLines?: ServerProviderUsageLine[];
}): ServerProviderUsageSnapshot {
  return {
    provider: input.provider ?? "claudeAgent",
    updatedAt: UPDATED_AT,
    limits: input.limits ?? [],
    usageLines: input.usageLines ?? [],
    source: "test",
    ...(input.status ? { status: input.status } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
  };
}

describe("mergeProviderUsage", () => {
  it("prefers the live snapshot over the local archive for the same window", () => {
    const merged = mergeProviderUsage({
      provider: "claudeAgent",
      liveSnapshot: snapshot({
        status: "ok",
        limits: [{ window: "5h", usedPercent: 20 }],
        usageLines: [{ label: "Live", value: "1" }],
      }),
      localSnapshot: snapshot({
        status: "ok",
        limits: [{ window: "5h", usedPercent: 90 }],
        usageLines: [{ label: "Local", value: "2" }],
      }),
      openUsageSnapshot: undefined,
      accountRateLimits: [],
    });

    expect(merged.rateLimits[0]?.limits).toEqual([{ window: "5h", usedPercent: 20 }]);
    expect(merged.usageLines).toEqual([{ label: "Live", value: "1" }]);
    expect(merged.blocksFallback).toBe(false);
  });

  it("falls back to the local archive when the live snapshot carries no windows", () => {
    const merged = mergeProviderUsage({
      provider: "claudeAgent",
      liveSnapshot: snapshot({ status: "ok" }),
      localSnapshot: snapshot({
        status: "ok",
        limits: [{ window: "Weekly", usedPercent: 48 }],
        usageLines: [{ label: "Local", value: "2" }],
      }),
      openUsageSnapshot: undefined,
      accountRateLimits: [],
    });

    expect(merged.rateLimits[0]?.limits).toEqual([{ window: "Weekly", usedPercent: 48 }]);
    expect(merged.usageLines).toEqual([{ label: "Local", value: "2" }]);
  });

  it("blocks every fallback when the live snapshot reports a failure", () => {
    const merged = mergeProviderUsage({
      provider: "claudeAgent",
      liveSnapshot: snapshot({ status: "needs-auth", detail: "Sign in with `claude`." }),
      localSnapshot: snapshot({ status: "ok", limits: [{ window: "5h", usedPercent: 10 }] }),
      openUsageSnapshot: undefined,
      accountRateLimits: [
        {
          provider: "claudeAgent",
          updatedAt: UPDATED_AT,
          limits: [{ window: "5h", usedPercent: 7 }],
        },
      ],
    });

    expect(merged.blocksFallback).toBe(true);
    expect(merged.rateLimits).toEqual([]);
    expect(merged.usageLines).toEqual([]);
    expect(merged.usageNotice).toBeUndefined();
  });

  it("surfaces a notice riding on an otherwise-ok snapshot", () => {
    const merged = mergeProviderUsage({
      provider: "claudeAgent",
      liveSnapshot: snapshot({
        status: "ok",
        detail: "Anthropic is throttling usage reads.",
        limits: [{ window: "5h", usedPercent: 5 }],
      }),
      localSnapshot: null,
      openUsageSnapshot: undefined,
      accountRateLimits: [],
    });

    expect(merged.usageNotice).toBe("Anthropic is throttling usage reads.");
  });

  it("keeps only the requested provider's thread-derived limits", () => {
    const merged = mergeProviderUsage({
      provider: "codex",
      liveSnapshot: null,
      localSnapshot: null,
      openUsageSnapshot: undefined,
      accountRateLimits: [
        { provider: "codex", updatedAt: UPDATED_AT, limits: [{ window: "5h", usedPercent: 12 }] },
        {
          provider: "claudeAgent",
          updatedAt: UPDATED_AT,
          limits: [{ window: "5h", usedPercent: 99 }],
        },
      ],
    });

    expect(merged.rateLimits).toHaveLength(1);
    expect(merged.rateLimits[0]?.provider).toBe("codex");
  });
});
