import type { IssuesListState, IssuesViewInput } from "@luminor/contracts";
import { queryOptions } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

export const issueQueryKeys = {
  all: ["issues"] as const,
  list: (state: IssuesListState) => ["issues", "list", state] as const,
  view: (input: IssuesViewInput | null) =>
    ["issues", "view", input?.repository ?? null, input?.number ?? null] as const,
};

export function issuesListQueryOptions(state: IssuesListState) {
  return queryOptions({
    queryKey: issueQueryKeys.list(state),
    queryFn: () => ensureNativeApi().issues.list({ state }),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
  });
}

export function issuesViewQueryOptions(input: IssuesViewInput | null) {
  return queryOptions({
    queryKey: issueQueryKeys.view(input),
    queryFn: () => {
      if (!input) {
        throw new Error("Issue view requires a repository and number.");
      }
      return ensureNativeApi().issues.view(input);
    },
    enabled: input !== null,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
}
