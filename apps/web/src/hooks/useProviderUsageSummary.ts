// FILE: useProviderUsageSummary.ts
// Purpose: Merge usage signals from thread activities, server-side local archives,
// and provider-specific snapshots into one UI-friendly summary for a single provider.
// Source precedence lives in ~/lib/providerUsageMerge, shared with the status-bar hook.

import type {
  OrchestrationThread,
  ProviderKind,
  ServerGetProviderUsageSnapshotResult,
} from "@luminor/contracts";
import { useQuery } from "@tanstack/react-query";

import { openUsageProviderSnapshotQueryOptions } from "~/lib/openUsageReactQuery";
import { mergeProviderUsage } from "~/lib/providerUsageMerge";
import { deriveAccountRateLimits, type ProviderRateLimit } from "~/lib/rateLimits";
import {
  serverAllProviderUsageQueryOptions,
  serverProviderUsageSnapshotQueryOptions,
} from "~/lib/serverReactQuery";

export function useProviderUsageSummary(input: {
  provider: ProviderKind | null | undefined;
  threads?: ReadonlyArray<Pick<OrchestrationThread, "activities">>;
  threadRateLimits?: ReadonlyArray<ProviderRateLimit> | undefined;
  codexHomePath?: string | null;
  providerSnapshot?: ServerGetProviderUsageSnapshotResult | undefined;
  fetchProviderData?: boolean;
}) {
  const provider = input.provider ?? null;
  const shouldFetchProviderData = input.fetchProviderData ?? true;
  const shouldFetchLiveProviderUsage =
    shouldFetchProviderData && provider !== null && input.providerSnapshot === undefined;
  const allProviderUsageQuery = useQuery(
    serverAllProviderUsageQueryOptions({
      enabled: shouldFetchLiveProviderUsage,
      provider,
    }),
  );
  const localUsageSnapshotQuery = useQuery(
    serverProviderUsageSnapshotQueryOptions({
      provider,
      homePath: provider === "codex" ? input.codexHomePath || null : null,
      enabled: shouldFetchLiveProviderUsage,
    }),
  );
  const openUsageSnapshotQuery = useQuery(
    openUsageProviderSnapshotQueryOptions(provider, { enabled: shouldFetchProviderData }),
  );
  const liveProviderSnapshot = (allProviderUsageQuery.data ?? []).find(
    (snapshot) => snapshot.provider === provider,
  );
  const merged = mergeProviderUsage({
    provider,
    liveSnapshot: liveProviderSnapshot ?? input.providerSnapshot ?? null,
    localSnapshot: localUsageSnapshotQuery.data ?? null,
    openUsageSnapshot: openUsageSnapshotQuery.data,
    accountRateLimits: input.threadRateLimits ?? deriveAccountRateLimits(input.threads ?? []),
  });

  const isLoading =
    shouldFetchLiveProviderUsage &&
    allProviderUsageQuery.isPending &&
    localUsageSnapshotQuery.isPending &&
    merged.rateLimits.length === 0 &&
    merged.usageLines.length === 0;

  return {
    isLoading,
    learnMoreHref: merged.learnMoreHref,
    rateLimits: merged.rateLimits,
    usageLines: merged.usageLines,
    usageNotice: merged.usageNotice,
  } as const;
}
