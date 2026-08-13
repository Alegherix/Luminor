// FILE: useKanbanPullRequestEntries.ts
// Purpose: Attach live GitHub PR state to Kanban cards via the PR list and worktree git status.
// Layer: UI hook (React Query)

import type { GitStatusResult, OrchestrationThreadPullRequest, PullRequestListEntry } from "@luminor/contracts";
import { coalescePullRequestListEntries } from "@luminor/shared/githubRepository";
import { resolveThreadWorkspaceCwd } from "@luminor/shared/threadEnvironment";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { gitStatusQueryOptions } from "~/lib/gitReactQuery";
import { pullRequestsListQueryOptions } from "~/lib/pullRequestReactQuery";
import { useStore } from "../../store";
import {
  flattenProjectBoardForOverview,
  overlayKanbanBoardPullRequests,
  type KanbanBoard,
  type KanbanLivePullRequestHint,
} from "./kanban.logic";

function gitStatusPrToThreadPullRequest(
  pr: NonNullable<GitStatusResult["pr"]>,
): OrchestrationThreadPullRequest {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    state: pr.state,
    isDraft: pr.isDraft,
    mergeability: pr.mergeability,
    additions: pr.additions ?? null,
    deletions: pr.deletions ?? null,
    changedFiles: pr.changedFiles ?? null,
  };
}

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

  const cardTargets = useMemo(() => {
    const targets: {
      threadId: string;
      cwd: string;
      storedBranch: string | null;
      dedicatedWorktree: boolean;
    }[] = [];
    const seenThreadIds = new Set<string>();
    for (const project of board.projects) {
      for (const card of flattenProjectBoardForOverview(project)) {
        if (seenThreadIds.has(card.threadId)) {
          continue;
        }
        const cwd = resolveThreadWorkspaceCwd({
          projectCwd: projectCwdById.get(card.projectId) ?? null,
          envMode: card.envMode,
          worktreePath: card.worktreePath,
          workingDirectory: card.thread?.workingDirectory,
        });
        if (cwd === null) {
          continue;
        }
        seenThreadIds.add(card.threadId);
        targets.push({
          threadId: card.threadId,
          cwd,
          storedBranch: card.thread?.branch ?? card.branch,
          dedicatedWorktree: card.envMode === "worktree" && Boolean(card.worktreePath),
        });
      }
    }
    return targets;
  }, [board, projectCwdById]);

  const uniqueCwds = useMemo(
    () => [...new Set(cardTargets.map((target) => target.cwd))].toSorted(),
    [cardTargets],
  );
  const statusQueries = useQueries({
    queries: uniqueCwds.map((cwd) => ({
      ...gitStatusQueryOptions(cwd),
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  });

  const liveByThreadId = useMemo(() => {
    const statusByCwd = new Map<string, (typeof statusQueries)[number]["data"]>();
    for (const [index, cwd] of uniqueCwds.entries()) {
      const status = statusQueries[index]?.data;
      if (status) {
        statusByCwd.set(cwd, status);
      }
    }

    const map = new Map<string, KanbanLivePullRequestHint>();
    for (const target of cardTargets) {
      const status = statusByCwd.get(target.cwd);
      if (!status) {
        continue;
      }
      const liveBranch = status.branch;
      const branchMatches =
        target.storedBranch !== null &&
        liveBranch !== null &&
        target.storedBranch === liveBranch;
      const pullRequest =
        status.pr && (target.dedicatedWorktree || branchMatches)
          ? gitStatusPrToThreadPullRequest(status.pr)
          : null;
      map.set(target.threadId, {
        branch: target.dedicatedWorktree ? liveBranch : (target.storedBranch ?? liveBranch),
        pullRequest,
      });
    }
    return map;
  }, [cardTargets, statusQueries, uniqueCwds]);

  return overlayKanbanBoardPullRequests(board, listEntries, liveByThreadId);
}
