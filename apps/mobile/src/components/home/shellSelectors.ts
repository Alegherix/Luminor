import type { OrchestrationProjectShell, OrchestrationSpaceShell } from "@luminor/contracts";

import type { ShellThread } from "../../api";
import type { ThreadStatusKind } from "../../state/threadStatus";
import { homeStrings, workspaceStrings } from "../../strings";
import { formatRelativeTime } from "./formatRelativeTime";

export const UNASSIGNED_WORKSPACE_ID = "__unassigned__";
export const RECENT_THREAD_PREVIEW = 4;
export const WORKSPACE_CHAT_PREVIEW = 8;

export type SpaceInput = {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
};

export type ProjectInput = {
  readonly id: string;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly spaceId: string | null;
  readonly isPinned: boolean;
};

export type SessionInput = {
  readonly status: string;
  readonly providerName: string | null;
  readonly runtimeMode: string;
  readonly updatedAt: string;
};

export type ThreadInput = {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly isPinned: boolean;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
  readonly latestUserMessageAt: string | null;
  readonly latestTurnStartedAt: string | null;
  readonly latestTurnCompletedAt: string | null;
  readonly session: SessionInput | null;
  readonly status: ThreadStatusKind;
  readonly unread: boolean;
  readonly needsAttention: boolean;
};

export type WorkspaceSummary = {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly projectCount: number;
  readonly threadCount: number;
  readonly terminalCount: number;
  readonly hasSessionData: boolean;
};

export type ThreadRowModel = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: ThreadStatusKind;
  readonly timeLabel: string;
  readonly unreadCount: number;
  readonly isPinned: boolean;
};

export type SessionRowModel = {
  readonly threadId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: ThreadStatusKind;
  readonly timeLabel: string;
};

export type PinnedCardModel = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
};

export type ProjectGroupModel = {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly isPinned: boolean;
  readonly threads: readonly ThreadRowModel[];
};

export type HomeModel = {
  readonly workspaces: readonly WorkspaceSummary[];
  readonly recentThreads: readonly ThreadRowModel[];
  readonly activityThreads: readonly ThreadRowModel[];
  readonly pinnedThreads: readonly ThreadRowModel[];
  readonly pinnedCount: number;
  readonly sessions: readonly SessionRowModel[];
  readonly hasSessionData: boolean;
  readonly hasNotifications: boolean;
};

export type WorkspaceDetailModel = {
  readonly id: string;
  readonly name: string;
  readonly projectCount: number;
  readonly threadCount: number;
  readonly runningTerminalCount: number;
  readonly hasSessionData: boolean;
  readonly pinned: readonly PinnedCardModel[];
  readonly projects: readonly ProjectGroupModel[];
  readonly chats: readonly ThreadRowModel[];
};

export function spaceFromShell(space: OrchestrationSpaceShell): SpaceInput {
  return {
    id: space.id,
    name: space.name,
    sortOrder: space.sortOrder,
  };
}

export function projectFromShell(project: OrchestrationProjectShell): ProjectInput {
  return {
    id: project.id,
    title: project.title,
    workspaceRoot: project.workspaceRoot,
    spaceId: project.spaceId ?? null,
    isPinned: project.isPinned === true,
  };
}

export function threadFromShell(thread: ShellThread): ThreadInput {
  return {
    id: thread.id,
    title: thread.title,
    projectId: thread.projectId,
    isPinned: thread.isPinned === true,
    archivedAt: thread.archivedAt ?? null,
    updatedAt: thread.updatedAt,
    latestUserMessageAt: thread.latestUserMessageAt ?? null,
    latestTurnStartedAt: thread.latestTurn?.startedAt ?? null,
    latestTurnCompletedAt: thread.latestTurn?.completedAt ?? null,
    session: thread.session
      ? {
          status: thread.session.status,
          providerName: thread.session.providerName,
          runtimeMode: thread.session.runtimeMode,
          updatedAt: thread.session.updatedAt,
        }
      : null,
    status: thread.status,
    unread: thread.unread,
    needsAttention: thread.needsAttention,
  };
}

export function projectPathLabel(workspaceRoot: string): string {
  const parts = workspaceRoot.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? workspaceRoot;
}

export function threadRecency(thread: ThreadInput): string {
  return (
    thread.latestUserMessageAt ??
    thread.latestTurnStartedAt ??
    thread.latestTurnCompletedAt ??
    thread.updatedAt
  );
}

export function sessionStatusToChip(status: string): ThreadStatusKind {
  switch (status) {
    case "running":
      return "running";
    case "starting":
      return "active";
    case "error":
    case "interrupted":
      return "needs-attention";
    default:
      return "idle";
  }
}

function isVisibleThread(thread: ThreadInput): boolean {
  return thread.archivedAt === null;
}

function isLiveSession(session: SessionInput | null): session is SessionInput {
  return session !== null && session.status !== "stopped";
}

function isRunningSession(session: SessionInput | null): boolean {
  return session !== null && (session.status === "running" || session.status === "starting");
}

function compareRecency(left: ThreadInput, right: ThreadInput): number {
  return threadRecency(right).localeCompare(threadRecency(left));
}

function unreadCount(thread: ThreadInput): number {
  return thread.unread || thread.needsAttention ? 1 : 0;
}

function sessionSubtitle(session: SessionInput): string {
  return [session.providerName, session.runtimeMode].filter(Boolean).join(" • ");
}

export function buildHomeModel(
  spaces: readonly SpaceInput[],
  projects: readonly ProjectInput[],
  threads: readonly ThreadInput[],
  nowMs = Date.now(),
): HomeModel {
  const visible = threads.filter(isVisibleThread);
  const workspaces = buildWorkspaces(spaces, projects, visible);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const spaceById = new Map(spaces.map((space) => [space.id, space]));

  const recentThreads = visible
    .slice().sort(compareRecency)
    .map((thread) => toThreadRow(thread, projectById, spaceById, nowMs));

  const activityThreads = visible
    .filter((thread) => thread.status !== "idle")
    .slice().sort(compareRecency)
    .map((thread) => toThreadRow(thread, projectById, spaceById, nowMs));

  const pinnedThreads = visible
    .filter((thread) => thread.isPinned)
    .slice().sort(compareRecency)
    .map((thread) => toThreadRow(thread, projectById, spaceById, nowMs));

  const sessions = visible.flatMap((thread) => {
    if (!isLiveSession(thread.session)) return [];
    const timeLabel = formatRelativeTime(thread.session.updatedAt, nowMs);
    return [
      {
        threadId: thread.id,
        title: thread.title,
        subtitle: sessionSubtitle(thread.session),
        status: sessionStatusToChip(thread.session.status),
        timeLabel,
      } satisfies SessionRowModel,
    ];
  });

  return {
    workspaces,
    recentThreads,
    activityThreads,
    pinnedThreads,
    pinnedCount: pinnedThreads.length,
    sessions,
    hasSessionData: sessions.length > 0,
    hasNotifications: visible.some((thread) => thread.unread || thread.needsAttention),
  };
}

export function buildWorkspaceDetail(
  workspaceId: string,
  spaces: readonly SpaceInput[],
  projects: readonly ProjectInput[],
  threads: readonly ThreadInput[],
  nowMs = Date.now(),
): WorkspaceDetailModel | null {
  const workspaces = buildWorkspaces(spaces, projects, threads.filter(isVisibleThread));
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return null;

  const memberProjects = projectsForWorkspace(workspaceId, spaces, projects);
  const memberProjectIds = new Set(memberProjects.map((project) => project.id));
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const memberThreads = threads
    .filter(isVisibleThread)
    .filter((thread) => memberProjectIds.has(thread.projectId))
    .slice().sort(compareRecency);

  const chats = memberThreads.map((thread) => toThreadRow(thread, projectById, spaceById, nowMs));
  const pinned = memberThreads
    .filter((thread) => thread.isPinned)
    .map((thread) => {
      const project = projectById.get(thread.projectId);
      return {
        id: thread.id,
        title: thread.title,
        subtitle: project
          ? `${workspaceStrings.threadKind} • ${project.title}`
          : workspaceStrings.threadKind,
      } satisfies PinnedCardModel;
    });

  const projectGroups = memberProjects
    .slice().sort((left, right) => left.title.localeCompare(right.title))
    .map((project) => {
      const projectThreads = memberThreads
        .filter((thread) => thread.projectId === project.id)
        .map((thread) => toThreadRow(thread, projectById, spaceById, nowMs));
      return {
        id: project.id,
        name: project.title,
        subtitle: projectPathLabel(project.workspaceRoot),
        isPinned: project.isPinned,
        threads: projectThreads,
      } satisfies ProjectGroupModel;
    });

  return {
    id: workspace.id,
    name: workspace.name,
    projectCount: workspace.projectCount,
    threadCount: workspace.threadCount,
    runningTerminalCount: memberThreads.filter((thread) => isRunningSession(thread.session)).length,
    hasSessionData: workspace.hasSessionData,
    pinned,
    projects: projectGroups,
    chats,
  };
}

export function buildWorkspaces(
  spaces: readonly SpaceInput[],
  projects: readonly ProjectInput[],
  threads: readonly ThreadInput[],
): WorkspaceSummary[] {
  const visible = threads.filter(isVisibleThread);
  if (spaces.length === 0) {
    return projects
      .slice().sort((left, right) => left.title.localeCompare(right.title))
      .map((project) =>
        toWorkspaceSummary({
          id: project.id,
          name: project.title,
          subtitle: projectPathLabel(project.workspaceRoot),
          projects: [project],
          threads: visible.filter((thread) => thread.projectId === project.id),
        }),
      );
  }

  const orderedSpaces = spaces.slice().sort((left, right) => left.sortOrder - right.sortOrder);
  const summaries = orderedSpaces.map((space) => {
    const spaceProjects = projects.filter((project) => project.spaceId === space.id);
    const projectIds = new Set(spaceProjects.map((project) => project.id));
    return toWorkspaceSummary({
      id: space.id,
      name: space.name,
      subtitle: homeStrings.workspaceSubtitle,
      projects: spaceProjects,
      threads: visible.filter((thread) => projectIds.has(thread.projectId)),
    });
  });

  const unassignedProjects = projects.filter((project) => project.spaceId === null);
  if (unassignedProjects.length === 0) return summaries;

  const unassignedIds = new Set(unassignedProjects.map((project) => project.id));
  summaries.push(
    toWorkspaceSummary({
      id: UNASSIGNED_WORKSPACE_ID,
      name: homeStrings.unassignedWorkspace,
      subtitle: homeStrings.workspaceSubtitle,
      projects: unassignedProjects,
      threads: visible.filter((thread) => unassignedIds.has(thread.projectId)),
    }),
  );
  return summaries;
}

function projectsForWorkspace(
  workspaceId: string,
  spaces: readonly SpaceInput[],
  projects: readonly ProjectInput[],
): ProjectInput[] {
  if (spaces.length === 0) {
    return projects.filter((project) => project.id === workspaceId);
  }
  if (workspaceId === UNASSIGNED_WORKSPACE_ID) {
    return projects.filter((project) => project.spaceId === null);
  }
  return projects.filter((project) => project.spaceId === workspaceId);
}

function toWorkspaceSummary(input: {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly projects: readonly ProjectInput[];
  readonly threads: readonly ThreadInput[];
}): WorkspaceSummary {
  const liveSessions = input.threads.filter((thread) => isLiveSession(thread.session));
  return {
    id: input.id,
    name: input.name,
    subtitle: input.subtitle,
    projectCount: input.projects.length,
    threadCount: input.threads.length,
    terminalCount: liveSessions.length,
    hasSessionData: liveSessions.length > 0,
  };
}

function toThreadRow(
  thread: ThreadInput,
  projectById: ReadonlyMap<string, ProjectInput>,
  spaceById: ReadonlyMap<string, SpaceInput>,
  nowMs: number,
): ThreadRowModel {
  const project = projectById.get(thread.projectId);
  const space = project?.spaceId ? spaceById.get(project.spaceId) : undefined;
  const subtitle = threadSubtitle(space?.name, project?.title);
  const timeLabel = formatRelativeTime(threadRecency(thread), nowMs);
  return {
    id: thread.id,
    title: thread.title,
    subtitle,
    status: thread.status,
    timeLabel,
    unreadCount: unreadCount(thread),
    isPinned: thread.isPinned,
  };
}

function threadSubtitle(spaceName: string | undefined, projectTitle: string | undefined): string {
  if (spaceName && projectTitle) return `${spaceName} • ${projectTitle}`;
  if (projectTitle) return projectTitle;
  if (spaceName) return spaceName;
  return homeStrings.workspaceSubtitle;
}
