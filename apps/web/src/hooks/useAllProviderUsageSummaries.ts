// FILE: useAllProviderUsageSummaries.ts
// Purpose: Usage summaries for every usage-capable provider from ONE shared all-provider query
// plus per-provider extras, for the global usage status bar and its roster popover.

import type { ProviderKind } from "@luminor/contracts";
import { PROVIDER_USAGE_PROVIDERS } from "@luminor/shared/providerUsage";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAppSettings } from "~/appSettings";
import {
  openUsageProviderSnapshotQueryOptions,
  openUsageQueryKeys,
} from "~/lib/openUsageReactQuery";
import {
  deriveProviderUsageDisplayRows,
  selectPrimaryProviderUsageDisplayRow,
  type ProviderUsageDisplayRow,
} from "~/lib/providerUsageDisplay";
import { mergeProviderUsage } from "~/lib/providerUsageMerge";
import {
  deriveUsageRosterRowState,
  isUsageRosterRowVisible,
  type UsageRosterRowState,
} from "~/lib/usageRosterRowState";
import {
  serverAllProviderUsageQueryOptions,
  serverProviderUsageSnapshotQueryOptions,
  serverQueryKeys,
} from "~/lib/serverReactQuery";

export interface ProviderUsageSummaryEntry {
  provider: ProviderKind;
  rows: ReadonlyArray<ProviderUsageDisplayRow>;
  /** Row with the least remaining quota — drives worst-first ordering and the bar countdown. */
  tightestRow: ProviderUsageDisplayRow | null;
  notice: string | undefined;
  state: UsageRosterRowState;
}

export interface AllProviderUsageSummaries {
  entries: ReadonlyArray<ProviderUsageSummaryEntry>;
  /** Entries with real numbers, worst remaining first — the status-bar segments. */
  visibleEntries: ReadonlyArray<ProviderUsageSummaryEntry>;
  /** Roster rows: same order, plus providers whose usage could not be read. */
  rosterEntries: ReadonlyArray<ProviderUsageSummaryEntry>;
  isFetching: boolean;
  refresh: () => void;
}

function compareUsageEntries(
  left: ProviderUsageSummaryEntry,
  right: ProviderUsageSummaryEntry,
): number {
  const leftRank = left.state.kind === "usage" ? 0 : 1;
  const rightRank = right.state.kind === "usage" ? 0 : 1;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return (left.tightestRow?.remainingPercent ?? 100) - (right.tightestRow?.remainingPercent ?? 100);
}

export function useAllProviderUsageSummaries(
  input: { enabled?: boolean } = {},
): AllProviderUsageSummaries {
  const enabled = input.enabled ?? true;
  const { settings } = useAppSettings();
  const codexHomePath = settings.codexHomePath || null;
  const queryClient = useQueryClient();

  const allProviderUsageQuery = useQuery(
    serverAllProviderUsageQueryOptions({ enabled }),
  );
  const localSnapshotQueries = useQueries({
    queries: PROVIDER_USAGE_PROVIDERS.map((provider) =>
      serverProviderUsageSnapshotQueryOptions({
        provider,
        homePath: provider === "codex" ? codexHomePath : null,
        enabled,
      }),
    ),
  });
  const openUsageQueries = useQueries({
    queries: PROVIDER_USAGE_PROVIDERS.map((provider) =>
      openUsageProviderSnapshotQueryOptions(provider, { enabled }),
    ),
  });

  const liveSnapshots = allProviderUsageQuery.data ?? [];
  const localSnapshots = localSnapshotQueries.map((query) => query.data ?? null);
  const localPending = localSnapshotQueries.map((query) => query.isPending);
  const openUsageSnapshots = openUsageQueries.map((query) => query.data);
  const livePending = allProviderUsageQuery.isPending;

  const entries: ReadonlyArray<ProviderUsageSummaryEntry> = PROVIDER_USAGE_PROVIDERS.map(
    (provider, index) => {
      const liveSnapshot = liveSnapshots.find((snapshot) => snapshot.provider === provider) ?? null;
      const merged = mergeProviderUsage({
        provider,
        liveSnapshot,
        localSnapshot: localSnapshots[index] ?? null,
        openUsageSnapshot: openUsageSnapshots[index],
        accountRateLimits: [],
      });
      const rows = deriveProviderUsageDisplayRows(merged.rateLimits);
      const isLoading =
        enabled && rows.length === 0 && (livePending || (localPending[index] ?? false));
      return {
        provider,
        rows,
        tightestRow: selectPrimaryProviderUsageDisplayRow(rows),
        notice: merged.usageNotice,
        state: deriveUsageRosterRowState({
          status: liveSnapshot?.status,
          detail: merged.usageNotice ?? liveSnapshot?.detail,
          hasRows: rows.length > 0,
          isLoading,
        }),
      };
    },
  );

  const visibleEntries = entries
    .filter((entry) => isUsageRosterRowVisible(entry.state))
    .toSorted(compareUsageEntries);
  // Signed-out providers stay hidden everywhere; errors and unavailable quotas still get a roster
  // row so a broken credential is explainable instead of silently missing.
  const rosterEntries = entries
    .filter((entry) => entry.state.kind !== "signed-out")
    .toSorted(compareUsageEntries);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: serverQueryKeys.allProviderUsage() });
    for (const provider of PROVIDER_USAGE_PROVIDERS) {
      void queryClient.invalidateQueries({
        queryKey: serverQueryKeys.providerUsage(
          provider,
          provider === "codex" ? codexHomePath : null,
        ),
      });
    }
    void queryClient.invalidateQueries({ queryKey: openUsageQueryKeys.all });
  }, [codexHomePath, queryClient]);

  const isFetching =
    allProviderUsageQuery.isFetching ||
    localSnapshotQueries.some((query) => query.isFetching) ||
    openUsageQueries.some((query) => query.isFetching);

  return { entries, visibleEntries, rosterEntries, isFetching, refresh };
}
