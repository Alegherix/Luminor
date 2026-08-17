import type { ProjectId, SpaceId, ThreadId } from "@luminor/contracts";

import type { Project, SidebarThreadSummary } from "~/types";

export const SPACE_JUST_FINISHED_LIMIT = 8;

export type SpaceJustFinishedThread = Pick<
  SidebarThreadSummary,
  | "id"
  | "title"
  | "projectId"
  | "parentThreadId"
  | "subagentAgentId"
  | "latestTurn"
  | "lastVisitedAt"
  | "archivedAt"
  | "hasLiveTailWork"
  | "session"
  | "modelSelection"
>;

export type SpaceJustFinishedProject = Pick<
  Project,
  "id" | "kind" | "name" | "folderName" | "spaceId"
>;

export interface SpaceJustFinishedItem {
  threadId: ThreadId;
  title: string;
  projectId: ProjectId;
  projectName: string;
  spaceId: SpaceId | null;
  completedAt: string;
  provider: SpaceJustFinishedThread["modelSelection"]["provider"];
}
