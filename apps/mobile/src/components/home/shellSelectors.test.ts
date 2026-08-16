import { describe, expect, it } from "vitest";

import {
  UNASSIGNED_WORKSPACE_ID,
  buildHomeModel,
  buildWorkspaceDetail,
  projectPathLabel,
  sessionStatusToChip,
  threadRecency,
  type ProjectInput,
  type SpaceInput,
  type ThreadInput,
} from "./shellSelectors";

const NOW = Date.parse("2026-08-16T12:00:00.000Z");

function space(id: string, name: string, sortOrder: number): SpaceInput {
  return { id, name, sortOrder };
}

function project(
  id: string,
  title: string,
  spaceId: string | null,
  extras: Partial<ProjectInput> = {},
): ProjectInput {
  return {
    id,
    title,
    workspaceRoot: `/repos/${title.toLowerCase()}`,
    spaceId,
    isPinned: false,
    ...extras,
  };
}

function thread(
  id: string,
  title: string,
  projectId: string,
  extras: Partial<ThreadInput> = {},
): ThreadInput {
  return {
    id,
    title,
    projectId,
    isPinned: false,
    archivedAt: null,
    updatedAt: "2026-08-16T11:00:00.000Z",
    latestUserMessageAt: null,
    latestTurnStartedAt: null,
    latestTurnCompletedAt: null,
    session: null,
    status: "idle",
    unread: false,
    needsAttention: false,
    ...extras,
  };
}

describe("projectPathLabel", () => {
  it("returns the last path segment", () => {
    expect(projectPathLabel("/home/dev/Luminor")).toBe("Luminor");
    expect(projectPathLabel("C:\\\\src\\\\app")).toBe("app");
  });
});

describe("sessionStatusToChip", () => {
  it("maps live session states onto status chips", () => {
    expect(sessionStatusToChip("running")).toBe("running");
    expect(sessionStatusToChip("starting")).toBe("active");
    expect(sessionStatusToChip("error")).toBe("needs-attention");
    expect(sessionStatusToChip("idle")).toBe("idle");
  });
});

describe("threadRecency", () => {
  it("prefers user message time, then turn times, then updatedAt", () => {
    expect(
      threadRecency(
        thread("t1", "A", "p1", {
          latestUserMessageAt: "2026-08-16T11:50:00.000Z",
          latestTurnStartedAt: "2026-08-16T11:40:00.000Z",
        }),
      ),
    ).toBe("2026-08-16T11:50:00.000Z");
    expect(
      threadRecency(
        thread("t1", "A", "p1", {
          latestTurnStartedAt: "2026-08-16T11:40:00.000Z",
        }),
      ),
    ).toBe("2026-08-16T11:40:00.000Z");
  });
});

describe("buildHomeModel", () => {
  const spaces = [space("s-personal", "Personal", 1), space("s-kognic", "Kognic", 0)];
  const projects = [
    project("p-luminor", "Luminor", "s-personal"),
    project("p-front", "frontend", "s-kognic"),
    project("p-orphan", "Scratch", null),
  ];
  const threads = [
    thread("t-old", "Old work", "p-luminor", {
      updatedAt: "2026-08-15T10:00:00.000Z",
    }),
    thread("t-active", "Fix search", "p-front", {
      status: "active",
      latestUserMessageAt: "2026-08-16T11:58:00.000Z",
      unread: true,
    }),
    thread("t-pin", "Pinned plan", "p-luminor", {
      isPinned: true,
      latestUserMessageAt: "2026-08-16T11:30:00.000Z",
    }),
    thread("t-archived", "Gone", "p-luminor", {
      archivedAt: "2026-08-16T09:00:00.000Z",
      isPinned: true,
      status: "running",
    }),
    thread("t-session", "prod-api", "p-front", {
      latestUserMessageAt: "2026-08-16T11:10:00.000Z",
      session: {
        status: "running",
        providerName: "codex",
        runtimeMode: "local",
        updatedAt: "2026-08-16T11:48:00.000Z",
      },
    }),
    thread("t-stopped", "old-term", "p-front", {
      session: {
        status: "stopped",
        providerName: "codex",
        runtimeMode: "local",
        updatedAt: "2026-08-16T08:00:00.000Z",
      },
    }),
    thread("t-scratch", "Notes", "p-orphan", {
      latestUserMessageAt: "2026-08-16T10:00:00.000Z",
    }),
  ];

  it("groups workspaces by space sort order and keeps unassigned projects", () => {
    const model = buildHomeModel(spaces, projects, threads, NOW);
    expect(model.workspaces.map((item) => item.id)).toEqual([
      "s-kognic",
      "s-personal",
      UNASSIGNED_WORKSPACE_ID,
    ]);
    expect(model.workspaces[0]).toMatchObject({
      name: "Kognic",
      projectCount: 1,
      threadCount: 3,
      terminalCount: 1,
      hasSessionData: true,
    });
    expect(model.workspaces[2]).toMatchObject({
      id: UNASSIGNED_WORKSPACE_ID,
      name: "Unassigned",
      projectCount: 1,
      threadCount: 1,
    });
  });

  it("falls back to one workspace per project when no spaces exist", () => {
    const model = buildHomeModel([], projects, threads, NOW);
    expect(model.workspaces.map((item) => item.id)).toEqual(["p-front", "p-luminor", "p-orphan"]);
    expect(model.workspaces[0]).toMatchObject({
      name: "frontend",
      subtitle: "frontend",
      threadCount: 3,
    });
  });

  it("sorts recent threads, hides archived, and exposes activity/pinned/session slices", () => {
    const model = buildHomeModel(spaces, projects, threads, NOW);
    expect(model.recentThreads.map((item) => item.id)).toEqual([
      "t-active",
      "t-pin",
      "t-session",
      "t-stopped",
      "t-scratch",
      "t-old",
    ]);
    expect(model.recentThreads[0]).toMatchObject({
      title: "Fix search",
      subtitle: "Kognic • frontend",
      timeLabel: "2m ago",
      unreadCount: 1,
      status: "active",
    });
    expect(model.activityThreads.map((item) => item.id)).toEqual(["t-active"]);
    expect(model.pinnedThreads.map((item) => item.id)).toEqual(["t-pin"]);
    expect(model.pinnedCount).toBe(1);
    expect(model.sessions).toEqual([
      {
        threadId: "t-session",
        title: "prod-api",
        subtitle: "codex • local",
        status: "running",
        timeLabel: "12m ago",
      },
    ]);
    expect(model.hasSessionData).toBe(true);
    expect(model.hasNotifications).toBe(true);
  });

  it("omits session data when no live session exists", () => {
    const model = buildHomeModel(
      spaces,
      projects,
      [thread("t1", "Idle", "p-luminor")],
      NOW,
    );
    expect(model.hasSessionData).toBe(false);
    expect(model.sessions).toEqual([]);
  });
});

describe("buildWorkspaceDetail", () => {
  const spaces = [space("s-personal", "Personal", 0)];
  const projects = [
    project("p-luminor", "Luminor", "s-personal"),
    project("p-docs", "Docs", "s-personal"),
    project("p-other", "Other", "s-other"),
  ];
  const threads = [
    thread("t-pin", "Pinned plan", "p-luminor", {
      isPinned: true,
      latestUserMessageAt: "2026-08-16T11:50:00.000Z",
    }),
    thread("t-chat", "Follow-up", "p-docs", {
      unread: true,
      latestUserMessageAt: "2026-08-16T11:40:00.000Z",
    }),
    thread("t-run", "Checks", "p-luminor", {
      session: {
        status: "starting",
        providerName: "grok",
        runtimeMode: "local",
        updatedAt: "2026-08-16T11:55:00.000Z",
      },
    }),
    thread("t-other", "Elsewhere", "p-other"),
  ];

  it("returns null for an unknown workspace", () => {
    expect(buildWorkspaceDetail("missing", spaces, projects, threads, NOW)).toBeNull();
  });

  it("scopes stats, pinned cards, project groups, and chats to the workspace", () => {
    const detail = buildWorkspaceDetail("s-personal", spaces, projects, threads, NOW);
    expect(detail).toMatchObject({
      id: "s-personal",
      name: "Personal",
      projectCount: 2,
      threadCount: 3,
      runningTerminalCount: 1,
      hasSessionData: true,
    });
    expect(detail?.pinned).toEqual([
      { id: "t-pin", title: "Pinned plan", subtitle: "Thread • Luminor" },
    ]);
    expect(detail?.projects.map((projectGroup) => projectGroup.id)).toEqual(["p-docs", "p-luminor"]);
    expect(detail?.projects[1]?.threads.map((item) => item.id)).toEqual(["t-pin", "t-run"]);
    expect(detail?.chats.map((item) => item.id)).toEqual(["t-pin", "t-chat", "t-run"]);
    expect(detail?.chats[1]).toMatchObject({ unreadCount: 1, subtitle: "Personal • Docs" });
  });

  it("resolves project-fallback workspaces by project id", () => {
    const detail = buildWorkspaceDetail("p-luminor", [], projects, threads, NOW);
    expect(detail).toMatchObject({
      id: "p-luminor",
      name: "Luminor",
      projectCount: 1,
      threadCount: 2,
    });
  });
});
