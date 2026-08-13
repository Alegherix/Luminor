// FILE: useKanbanPullRequestEntries.ts
// Purpose: Load the live GitHub PR list used to attach PR state onto Kanban cards.
// Layer: UI hook (React Query)

import type { PullRequestListEntry } from "@luminor/contracts";
import { coalescePullRequestListEntries } from "@luminor/shared/githubRepository";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { pullRequestsListQueryOptions } from "~/lib/pullRequestReactQuery";

export function useKanbanPullRequestEntries(): readonly PullRequestListEntry[] {
  const openQuery = useQuery(pullRequestsListQueryOptions({ state: "open", projectId: null }));
  const mergedQuery = useQuery(pullRequestsListQueryOptions({ state: "merged", projectId: null }));

  return useMemo(
    () =>
      coalescePullRequestListEntries([
        ...(openQuery.data?.entries ?? []),
        ...(mergedQuery.data?.entries ?? []),
      ]),
    [mergedQuery.data?.entries, openQuery.data?.entries],
  );
}
