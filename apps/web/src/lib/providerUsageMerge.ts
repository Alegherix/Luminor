// FILE: providerUsageMerge.ts
// Purpose: Pure merge of the usage signals available for one provider (thread-derived account
// limits, the live server snapshot, the local archive snapshot, and OpenUsage) into the rate-limit
// rows, usage lines, and notice the UI renders. Shared by the single-provider summary hook and the
// multi-provider status-bar hook so both resolve precedence identically.

import type { ProviderKind, ServerGetProviderUsageSnapshotResult } from "@luminor/contracts";

import {
  normalizeOpenUsageSnapshot,
  normalizeOpenUsageUsageLines,
  type OpenUsageUsageLine,
} from "~/lib/openUsageRateLimits";
import {
  isProviderUsageSnapshotNonOk,
  normalizeServerProviderUsageLines,
  normalizeServerProviderUsageRateLimit,
} from "~/lib/providerUsageSnapshot";
import {
  deriveProviderUsageLearnMoreHref,
  deriveRateLimitLearnMoreHref,
  mergeProviderRateLimits,
  type ProviderRateLimit,
} from "~/lib/rateLimits";

export interface ProviderUsageMergeInput {
  provider: ProviderKind | null;
  liveSnapshot: ServerGetProviderUsageSnapshotResult | null | undefined;
  localSnapshot: ServerGetProviderUsageSnapshotResult | null | undefined;
  openUsageSnapshot: unknown;
  accountRateLimits: ReadonlyArray<ProviderRateLimit>;
}

export interface ProviderUsageMergeResult {
  rateLimits: ReadonlyArray<ProviderRateLimit>;
  usageLines: ReadonlyArray<OpenUsageUsageLine>;
  usageNotice: string | undefined;
  learnMoreHref: string | null;
  /** An explicit live failure is authoritative: no fallback source may fill the gap. */
  blocksFallback: boolean;
}

export function mergeProviderUsage(input: ProviderUsageMergeInput): ProviderUsageMergeResult {
  const provider = input.provider;
  const liveSnapshot = input.liveSnapshot ?? null;
  const blocksFallback = isProviderUsageSnapshotNonOk(liveSnapshot);

  let rateLimits: ReadonlyArray<ProviderRateLimit> = [];
  let usageLines: ReadonlyArray<OpenUsageUsageLine> = [];

  if (!blocksFallback) {
    const derivedRateLimits = input.accountRateLimits.filter((rateLimit) =>
      provider ? rateLimit.provider === provider : true,
    );
    const liveUsageRateLimit = normalizeServerProviderUsageRateLimit(liveSnapshot);
    const localUsageRateLimit = normalizeServerProviderUsageRateLimit(input.localSnapshot);
    const openUsageSnapshot = normalizeOpenUsageSnapshot(input.openUsageSnapshot, provider);
    rateLimits = mergeProviderRateLimits(
      derivedRateLimits,
      mergeProviderRateLimits(
        liveUsageRateLimit ? [liveUsageRateLimit] : [],
        mergeProviderRateLimits(
          localUsageRateLimit ? [localUsageRateLimit] : [],
          openUsageSnapshot ? [openUsageSnapshot] : [],
        ),
      ),
    );

    const liveUsageLines = normalizeServerProviderUsageLines(liveSnapshot);
    if (liveUsageLines.length > 0) {
      usageLines = liveUsageLines;
    } else {
      const localUsageLines = normalizeServerProviderUsageLines(input.localSnapshot);
      usageLines =
        localUsageLines.length > 0
          ? localUsageLines
          : normalizeOpenUsageUsageLines(input.openUsageSnapshot);
    }
  }

  // A throttle/staleness note the server rides on an otherwise-ok snapshot (e.g. Claude serving
  // the last values while Anthropic rate-limits). Non-ok snapshots hide the section entirely, so
  // their `detail` would never be seen anyway.
  const detail = blocksFallback ? undefined : liveSnapshot?.detail?.trim();

  return {
    rateLimits,
    usageLines,
    usageNotice: detail ? detail : undefined,
    learnMoreHref:
      deriveRateLimitLearnMoreHref(rateLimits) ?? deriveProviderUsageLearnMoreHref(provider),
    blocksFallback,
  };
}
