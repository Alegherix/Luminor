import { describe, expect, it } from "vitest";
import { ProjectId, SpaceId, ThreadId } from "@luminor/contracts";

import type { ThreadSession } from "~/types";

import { collectSpaceJustFinishedItems } from "./SpaceJustFinishedPeek.logic";
import type { SpaceJustFinishedProject, SpaceJustFinishedThread } from "./spaceJustFinishedTypes";

const KOGNIC = SpaceId.makeUnsafe("space-kognic");
const COMPUTER = SpaceId.makeUnsafe("space-computer");
const LUMINOR_PROJECT = ProjectId.makeUnsafe("project-luminor");
const COMPUTER_PROJECT = ProjectId.makeUnsafe("project-computer");
const CHAT_PROJECT = ProjectId.makeUnsafe("project-home-chat");
const STUDIO_PROJECT = ProjectId.makeUnsafe("project-studio");

function makeSession(status: ThreadSession["status"]): ThreadSession {
  return {
    provider: "codex",
    status,
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-17T10:00:00.000Z",
    orchestrationStatus: status === "running" ? "running" : "idle",
  } as ThreadSession;
}

function makeProject(
  overrides: Partial<SpaceJustFinishedProject> & { id: SpaceJustFinishedProject["id"] },
): SpaceJustFinishedProject {
  return {
    kind: "project",
    name: "Luminor",
    folderName: "Luminor",
    spaceId: KOGNIC,
    ...overrides,
  };
}

function makeThread(
  overrides: Omit<Partial<SpaceJustFinishedThread>, "id"> & { id: string },
): SpaceJustFinishedThread {
  return {
    id: ThreadId.makeUnsafe(overrides.id),
    title: overrides.title ?? `Thread ${overrides.id}`,
    projectId: overrides.projectId ?? LUMINOR_PROJECT,
    parentThreadId: overrides.parentThreadId ?? null,
    subagentAgentId: overrides.subagentAgentId ?? null,
    latestTurn:
      overrides.latestTurn === undefined
        ? {
            turnId: `turn-${overrides.id}` as never,
            state: "completed",
            assistantMessageId: null,
            requestedAt: "2026-08-17T10:00:00.000Z",
            startedAt: "2026-08-17T10:00:00.000Z",
            completedAt: "2026-08-17T10:05:00.000Z",
          }
        : overrides.latestTurn,
    lastVisitedAt: overrides.lastVisitedAt,
    archivedAt: overrides.archivedAt ?? null,
    hasLiveTailWork: overrides.hasLiveTailWork ?? false,
    session: overrides.session ?? null,
    modelSelection: overrides.modelSelection ?? { provider: "grok", model: "grok-4.6" },
  };
}

const projects = [
  makeProject({ id: LUMINOR_PROJECT, name: "Luminor" }),
  makeProject({
    id: COMPUTER_PROJECT,
    name: "Computer",
    folderName: "Computer",
    spaceId: COMPUTER,
  }),
];

describe("collectSpaceJustFinishedItems", () => {
  it("keeps unseen top-level completions in the current space, newest first", () => {
    const items = collectSpaceJustFinishedItems({
      threads: [
        makeThread({
          id: "older",
          title: "Mobile T4",
          latestTurn: {
            turnId: "turn-older" as never,
            state: "completed",
            assistantMessageId: null,
            requestedAt: "2026-08-17T09:00:00.000Z",
            startedAt: "2026-08-17T09:00:00.000Z",
            completedAt: "2026-08-17T09:10:00.000Z",
          },
        }),
        makeThread({
          id: "newer",
          title: "Prototype B",
          latestTurn: {
            turnId: "turn-newer" as never,
            state: "completed",
            assistantMessageId: null,
            requestedAt: "2026-08-17T11:00:00.000Z",
            startedAt: "2026-08-17T11:00:00.000Z",
            completedAt: "2026-08-17T11:20:00.000Z",
          },
        }),
      ],
      projects,
      activeSpaceId: KOGNIC,
      activeThreadId: null,
    });

    expect(items.map((item) => item.threadId)).toEqual([
      ThreadId.makeUnsafe("newer"),
      ThreadId.makeUnsafe("older"),
    ]);
    expect(items[0]).toMatchObject({
      title: "Prototype B",
      projectName: "Luminor",
      completedAt: "2026-08-17T11:20:00.000Z",
      provider: "grok",
    });
  });

  it("hides spawned children even when they finished unseen", () => {
    const parentId = ThreadId.makeUnsafe("orchestrator");
    const items = collectSpaceJustFinishedItems({
      threads: [
        makeThread({
          id: "child-parented",
          title: "Child A",
          parentThreadId: parentId,
        }),
        makeThread({
          id: "child-subagent",
          title: "Child B",
          subagentAgentId: "agent-child-b",
        }),
        makeThread({
          id: "orchestrator",
          title: "Orchestrator",
          lastVisitedAt: "2026-08-17T09:00:00.000Z",
        }),
      ],
      projects,
      activeSpaceId: KOGNIC,
      activeThreadId: null,
    });

    expect(items.map((item) => item.threadId)).toEqual([parentId]);
  });

  it("does not advertise a parent until the parent itself has an unseen completion", () => {
    const items = collectSpaceJustFinishedItems({
      threads: [
        makeThread({
          id: "parent-seen",
          title: "Orchestrator",
          lastVisitedAt: "2026-08-17T12:00:00.000Z",
          latestTurn: {
            turnId: "turn-parent" as never,
            state: "completed",
            assistantMessageId: null,
            requestedAt: "2026-08-17T10:00:00.000Z",
            startedAt: "2026-08-17T10:00:00.000Z",
            completedAt: "2026-08-17T11:00:00.000Z",
          },
        }),
        makeThread({
          id: "child-1",
          parentThreadId: ThreadId.makeUnsafe("parent-seen"),
        }),
      ],
      projects,
      activeSpaceId: KOGNIC,
      activeThreadId: null,
    });

    expect(items).toEqual([]);
  });

  it("scopes to the active space and rebuilds when the space changes", () => {
    const threads = [
      makeThread({ id: "kognic-done", title: "Kognic done" }),
      makeThread({
        id: "computer-done",
        title: "Computer done",
        projectId: COMPUTER_PROJECT,
      }),
    ];

    expect(
      collectSpaceJustFinishedItems({
        threads,
        projects,
        activeSpaceId: KOGNIC,
        activeThreadId: null,
      }).map((item) => item.threadId),
    ).toEqual([ThreadId.makeUnsafe("kognic-done")]);

    expect(
      collectSpaceJustFinishedItems({
        threads,
        projects,
        activeSpaceId: COMPUTER,
        activeThreadId: null,
      }).map((item) => item.threadId),
    ).toEqual([ThreadId.makeUnsafe("computer-done")]);
  });

  it("hides the open thread, running work, visited completions, and archived rows", () => {
    const items = collectSpaceJustFinishedItems({
      threads: [
        makeThread({ id: "open-done", title: "Open" }),
        makeThread({
          id: "running",
          title: "Running",
          hasLiveTailWork: true,
        }),
        makeThread({
          id: "connecting",
          title: "Connecting",
          session: makeSession("connecting"),
        }),
        makeThread({
          id: "seen",
          title: "Seen",
          lastVisitedAt: "2026-08-17T12:00:00.000Z",
        }),
        makeThread({
          id: "archived",
          title: "Archived",
          archivedAt: "2026-08-17T12:00:00.000Z",
        }),
        makeThread({ id: "still-unseen", title: "Still unseen" }),
      ],
      projects,
      activeSpaceId: KOGNIC,
      activeThreadId: ThreadId.makeUnsafe("open-done"),
    });

    expect(items.map((item) => item.threadId)).toEqual([ThreadId.makeUnsafe("still-unseen")]);
  });

  it("caps the list at eight newest completions", () => {
    const threads = Array.from({ length: 10 }, (_, index) =>
      makeThread({
        id: `done-${index}`,
        latestTurn: {
          turnId: `turn-${index}` as never,
          state: "completed",
          assistantMessageId: null,
          requestedAt: `2026-08-17T10:${String(index).padStart(2, "0")}:00.000Z`,
          startedAt: `2026-08-17T10:${String(index).padStart(2, "0")}:00.000Z`,
          completedAt: `2026-08-17T10:${String(index).padStart(2, "0")}:00.000Z`,
        },
      }),
    );

    const items = collectSpaceJustFinishedItems({
      threads,
      projects,
      activeSpaceId: KOGNIC,
      activeThreadId: null,
    });

    expect(items).toHaveLength(8);
    expect(items[0]?.threadId).toEqual(ThreadId.makeUnsafe("done-9"));
    expect(items[7]?.threadId).toEqual(ThreadId.makeUnsafe("done-2"));
  });

  it("includes home chat completions next to the current space, labeled Chat", () => {
    const items = collectSpaceJustFinishedItems({
      threads: [
        makeThread({
          id: "space-done",
          title: "Space thread",
        }),
        makeThread({
          id: "chat-done",
          title: "Wave XLR mic after reboot",
          projectId: CHAT_PROJECT,
        }),
        makeThread({
          id: "studio-done",
          title: "Studio note",
          projectId: STUDIO_PROJECT,
        }),
      ],
      projects: [
        ...projects,
        makeProject({
          id: CHAT_PROJECT,
          kind: "chat",
          name: "Home",
          folderName: "Home",
          spaceId: null,
        }),
        makeProject({
          id: STUDIO_PROJECT,
          kind: "studio",
          name: "Studio",
          folderName: "Studio",
          spaceId: null,
        }),
      ],
      activeSpaceId: KOGNIC,
      activeThreadId: null,
    });

    expect(items.map((item) => item.threadId)).toEqual([
      ThreadId.makeUnsafe("space-done"),
      ThreadId.makeUnsafe("chat-done"),
    ]);
    expect(items[1]).toMatchObject({
      title: "Wave XLR mic after reboot",
      projectName: "Chat",
    });
  });
});
