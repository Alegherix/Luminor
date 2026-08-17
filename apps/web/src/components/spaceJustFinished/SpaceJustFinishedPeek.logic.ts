import type { SpaceId, ThreadId } from "@luminor/contracts";

import {
  hasUnseenCompletion,
  isThreadActivelyWorking,
  resolveThreadProjectLabel,
} from "../Sidebar.logic";
import {
  SPACE_JUST_FINISHED_LIMIT,
  type SpaceJustFinishedItem,
  type SpaceJustFinishedProject,
  type SpaceJustFinishedThread,
} from "./spaceJustFinishedTypes";

function completedAtMs(completedAt: string): number {
  const parsed = Date.parse(completedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function isSpawnedChildThread(thread: SpaceJustFinishedThread): boolean {
  return Boolean(thread.parentThreadId) || Boolean(thread.subagentAgentId);
}

function isRunningThread(thread: SpaceJustFinishedThread): boolean {
  return isThreadActivelyWorking(thread) || thread.session?.status === "connecting";
}

export function collectSpaceJustFinishedItems(input: {
  threads: ReadonlyArray<SpaceJustFinishedThread>;
  projects: ReadonlyArray<SpaceJustFinishedProject>;
  activeSpaceId: SpaceId | null;
  activeThreadId: ThreadId | string | null;
  limit?: number;
}): SpaceJustFinishedItem[] {
  const projectById = new Map(
    input.projects
      .filter((project) => (project.spaceId ?? null) === input.activeSpaceId)
      .map((project) => [project.id, project] as const),
  );
  const limit = input.limit ?? SPACE_JUST_FINISHED_LIMIT;
  const items: SpaceJustFinishedItem[] = [];

  for (const thread of input.threads) {
    if (thread.archivedAt != null) continue;
    if (isSpawnedChildThread(thread)) continue;
    if (thread.id === input.activeThreadId) continue;
    if (isRunningThread(thread)) continue;
    if (!hasUnseenCompletion(thread)) continue;

    const project = projectById.get(thread.projectId);
    if (!project) continue;

    const completedAt = thread.latestTurn?.completedAt;
    if (!completedAt) continue;

    items.push({
      threadId: thread.id,
      title: thread.title,
      projectId: thread.projectId,
      projectName: resolveThreadProjectLabel(project),
      spaceId: project.spaceId ?? null,
      completedAt,
      provider: thread.session?.provider ?? thread.modelSelection.provider,
    });
  }

  items.sort((left, right) => completedAtMs(right.completedAt) - completedAtMs(left.completedAt));
  return items.slice(0, limit);
}
