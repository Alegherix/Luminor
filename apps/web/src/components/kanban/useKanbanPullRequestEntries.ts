// FILE: useKanbanPullRequestEntries.ts
// Purpose: Attach live GitHub PR state to Kanban cards via the PR list and local worktree branches.
// Layer: UI hook (React Query)

import type { PullRequestListEntry } from "@luminor/contracts";
import { coalescePullRequestListEntries } from "@luminor/shared/githubRepository";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { gitBranchesQueryOptions } from "~/lib/gitReactQuery";
import { pullRequestsListQueryOptions } from "~/lib/pullRequestReactQuery";
import { useStore } from "../../store";
import {
  flattenProjectBoardForOverview,
  liveBranchByWorktreePath,
  normalizeKanbanWorktreePath,
  overlayKanbanBoardPullRequests,
  type KanbanBoard,
  type KanbanLivePullRequestHint,
} from "./kanban.logic";

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

export function useKanbanBoardPullRequests(board: KanbanBoard): KanbanBoard {
  const listEntries = useKanbanPullRequestEntries();
  const projects = useStore((state) => state.projects);
  const projectCwdById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.cwd] as const)),
    [projects],
  );

  const projectCwds = useMemo(() => {
    const cwds = new Set<string>();
    for (const project of board.projects) {
      const cwd = projectCwdById.get(project.projectId);
      if (cwd) {
        cwds.add(cwd);
      }
    }
    return [...cwds].toSorted();
  }, [board, projectCwdById]);

  const branchQueries = useQueries({
    queries: projectCwds.map((cwd) => gitBranchesQueryOptions(cwd)),
  });

  const liveByThreadId = useMemo(() => {
    const branchByWorktree = new Map<string, string>();
    for (const query of branchQueries) {
      if (!query.data) {
        continue;
      }
      for (const [path, branch] of liveBranchByWorktreePath(query.data.branches)) {
        branchByWorktree.set(path, branch);
      }
    }

    const map = new Map<string, KanbanLivePullRequestHint>();
    for (const project of board.projects) {
      for (const card of flattenProjectBoardForOverview(project)) {
        if (map.has(card.threadId) || !card.worktreePath) {
          continue;
        }
        const liveBranch = branchByWorktree.get(normalizeKanbanWorktreePath(card.worktreePath));
        if (!liveBranch) {
          continue;
        }
        map.set(card.threadId, { branch: liveBranch, pullRequest: null });
      }
    }
    return map;
  }, [board, branchQueries]);

  return overlayKanbanBoardPullRequests(board, listEntries, liveByThreadId);
}
