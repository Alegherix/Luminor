// FILE: threadFolderMoves.test.ts
// Purpose: Cover thread→folder move eligibility, menu construction, batching, and partial-failure reporting.
// Layer: Web client helper test
// Targets: resolveFolderMoveScope, resolveSingleProjectFolderMoveScope, resolveFolderDropTarget, planFolderMove, buildFolderMoveMenuItems, parseFolderMoveMenuId, moveThreadsToFolder, groupThreadsIntoNewFolder, describeFolderMoveOutcome.

import { FolderId, ProjectId, SpaceId, ThreadId, type NativeApi } from "@luminor/contracts";
import { projectFolderOwner, spaceFolderOwner } from "@luminor/shared/folderOwnership";
import { describe, expect, it, vi } from "vitest";

import {
  buildFolderMoveMenuItems,
  describeFolderMoveOutcome,
  groupThreadsIntoNewFolder,
  moveThreadsToFolder,
  parseFolderMoveMenuId,
  planFolderMove,
  resolveFolderDropTarget,
  resolveFolderMoveScope,
  resolveSingleProjectFolderMoveScope,
  type FolderMoveThread,
} from "./threadFolderMoves";

const PROJECT_A = ProjectId.makeUnsafe("project-a");
const PROJECT_B = ProjectId.makeUnsafe("project-b");
const FOLDER_A = FolderId.makeUnsafe("folder-a");
const FOLDER_B = FolderId.makeUnsafe("folder-b");
const THREAD_1 = ThreadId.makeUnsafe("thread-1");
const THREAD_2 = ThreadId.makeUnsafe("thread-2");
const THREAD_3 = ThreadId.makeUnsafe("thread-3");

function thread(overrides: Partial<FolderMoveThread> & { id: ThreadId }): FolderMoveThread {
  return { projectId: PROJECT_A, ...overrides };
}

function makeApi(dispatchCommand: ReturnType<typeof vi.fn>): NativeApi {
  return { orchestration: { dispatchCommand } } as unknown as NativeApi;
}

describe("resolveFolderMoveScope", () => {
  it("keeps root threads of one project and reports subagent rows as skipped", () => {
    const scope = resolveFolderMoveScope([
      thread({ id: THREAD_1 }),
      thread({ id: THREAD_2, folderId: FOLDER_A }),
      thread({ id: THREAD_3, parentThreadId: THREAD_1 }),
    ]);

    expect(scope).not.toBeNull();
    expect(scope?.projectIds).toEqual([PROJECT_A]);
    expect(scope?.threadIds).toEqual([THREAD_1, THREAD_2]);
    expect(scope?.skippedThreadIds).toEqual([THREAD_3]);
    expect([...(scope?.folderIds ?? [])]).toEqual([null, FOLDER_A]);
  });

  it("keeps a selection spanning projects, which a space folder can host", () => {
    const scope = resolveFolderMoveScope([
      thread({ id: THREAD_1 }),
      thread({ id: THREAD_2, projectId: PROJECT_B }),
      thread({ id: THREAD_3, projectId: PROJECT_B }),
    ]);

    expect(scope?.projectIds).toEqual([PROJECT_A, PROJECT_B]);
    expect(scope?.threadIds).toEqual([THREAD_1, THREAD_2, THREAD_3]);
  });

  it("rejects a selection of only subagent rows", () => {
    expect(resolveFolderMoveScope([thread({ id: THREAD_3, parentThreadId: THREAD_1 })])).toBeNull();
  });
});

describe("resolveSingleProjectFolderMoveScope", () => {
  it("narrows a single-project selection to the project owning its folders", () => {
    const scope = resolveSingleProjectFolderMoveScope(
      resolveFolderMoveScope([thread({ id: THREAD_1 }), thread({ id: THREAD_2 })]),
    );

    expect(scope?.projectId).toBe(PROJECT_A);
    expect(scope?.threadIds).toEqual([THREAD_1, THREAD_2]);
  });

  it("refuses a selection spanning projects, which no project owner can serve", () => {
    expect(
      resolveSingleProjectFolderMoveScope(
        resolveFolderMoveScope([
          thread({ id: THREAD_1 }),
          thread({ id: THREAD_2, projectId: PROJECT_B }),
        ]),
      ),
    ).toBeNull();
    expect(resolveSingleProjectFolderMoveScope(null)).toBeNull();
  });
});

describe("resolveFolderDropTarget", () => {
  const SPACE = SpaceId.makeUnsafe("space-feature-work");
  const OTHER_SPACE = SpaceId.makeUnsafe("space-other");
  const spaceOf = (spaceIdByProjectId: Partial<Record<ProjectId, SpaceId>>) => ({
    resolveProjectSpaceId: (projectId: ProjectId) => spaceIdByProjectId[projectId] ?? null,
  });

  it("accepts a folder owned by the dragged threads' project", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A],
        owner: projectFolderOwner(PROJECT_A),
        ...spaceOf({}),
      }),
    ).toEqual({ accepted: true });
  });

  it("refuses a folder owned by another project and names the offending project", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A],
        owner: projectFolderOwner(PROJECT_B),
        ...spaceOf({ [PROJECT_A]: SPACE }),
      }),
    ).toEqual({ accepted: false, rejection: "other-project", rejectedProjectId: PROJECT_A });
  });

  it("accepts a space folder when the project is in that space", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A],
        owner: spaceFolderOwner(SPACE),
        ...spaceOf({ [PROJECT_A]: SPACE }),
      }),
    ).toEqual({ accepted: true });
  });

  it("refuses a space folder when the project is outside the space", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A],
        owner: spaceFolderOwner(SPACE),
        ...spaceOf({ [PROJECT_A]: OTHER_SPACE }),
      }),
    ).toEqual({
      accepted: false,
      rejection: "project-outside-space",
      rejectedProjectId: PROJECT_A,
    });
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A],
        owner: spaceFolderOwner(SPACE),
        ...spaceOf({}),
      }),
    ).toEqual({
      accepted: false,
      rejection: "project-outside-space",
      rejectedProjectId: PROJECT_A,
    });
  });

  it("accepts a space folder for a selection spanning two projects of that space", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A, PROJECT_B],
        owner: spaceFolderOwner(SPACE),
        ...spaceOf({ [PROJECT_A]: SPACE, [PROJECT_B]: SPACE }),
      }),
    ).toEqual({ accepted: true });
  });

  it("refuses the whole selection when one project is outside the target space", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A, PROJECT_B],
        owner: spaceFolderOwner(SPACE),
        ...spaceOf({ [PROJECT_A]: SPACE, [PROJECT_B]: OTHER_SPACE }),
      }),
    ).toEqual({
      accepted: false,
      rejection: "project-outside-space",
      rejectedProjectId: PROJECT_B,
    });
  });

  it("refuses a project folder for a selection spanning projects, target owner deciding", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [PROJECT_A, PROJECT_B],
        owner: projectFolderOwner(PROJECT_A),
        ...spaceOf({ [PROJECT_A]: SPACE, [PROJECT_B]: SPACE }),
      }),
    ).toEqual({ accepted: false, rejection: "other-project", rejectedProjectId: PROJECT_B });
  });

  it("lets the target owner decide for a selection spanning both folder kinds", () => {
    const spanningBothKinds = resolveFolderMoveScope([
      thread({ id: THREAD_1, folderId: FOLDER_A }),
      thread({ id: THREAD_2, projectId: PROJECT_B, folderId: FOLDER_B }),
    ]);
    const inOneSpace = spaceOf({ [PROJECT_A]: SPACE, [PROJECT_B]: SPACE });

    expect(
      resolveFolderDropTarget({
        projectIds: spanningBothKinds?.projectIds ?? [],
        owner: spaceFolderOwner(SPACE),
        ...inOneSpace,
      }),
    ).toEqual({ accepted: true });
    expect(
      resolveFolderDropTarget({
        projectIds: spanningBothKinds?.projectIds ?? [],
        owner: projectFolderOwner(PROJECT_A),
        ...inOneSpace,
      }),
    ).toEqual({ accepted: false, rejection: "other-project", rejectedProjectId: PROJECT_B });
  });

  it("accepts a project's unfiled area for its own threads whichever folder kind they leave", () => {
    for (const folderId of [FOLDER_A, FOLDER_B, null] as const) {
      const scope = resolveFolderMoveScope([thread({ id: THREAD_1, folderId })]);
      expect(
        resolveFolderDropTarget({
          projectIds: scope?.projectIds ?? [],
          owner: projectFolderOwner(PROJECT_A),
          ...spaceOf({ [PROJECT_A]: SPACE }),
        }),
      ).toEqual({ accepted: true });
    }
  });

  it("refuses without a cause when the drag carries no thread", () => {
    expect(
      resolveFolderDropTarget({
        projectIds: [],
        owner: spaceFolderOwner(SPACE),
        ...spaceOf({}),
      }),
    ).toEqual({ accepted: false, rejection: null, rejectedProjectId: null });
  });
});

describe("planFolderMove", () => {
  it("skips threads already in the target folder", () => {
    const plan = planFolderMove({
      threads: [thread({ id: THREAD_1, folderId: FOLDER_A }), thread({ id: THREAD_2 })],
      folderId: FOLDER_A,
    });

    expect(plan?.pendingThreadIds).toEqual([THREAD_2]);
    expect(plan?.threadIds).toEqual([THREAD_1, THREAD_2]);
  });

  it("treats unfiling as a no-op for threads outside folders", () => {
    const plan = planFolderMove({
      threads: [thread({ id: THREAD_1 }), thread({ id: THREAD_2, folderId: FOLDER_B })],
      folderId: null,
    });

    expect(plan?.pendingThreadIds).toEqual([THREAD_2]);
  });

  it("carries every project of a cross-project selection for the target to judge", () => {
    const plan = planFolderMove({
      threads: [thread({ id: THREAD_1 }), thread({ id: THREAD_2, projectId: PROJECT_B })],
      folderId: FOLDER_A,
    });

    expect(plan?.projectIds).toEqual([PROJECT_A, PROJECT_B]);
    expect(plan?.pendingThreadIds).toEqual([THREAD_1, THREAD_2]);
  });

  it("returns no plan when the selection has no root thread", () => {
    expect(
      planFolderMove({
        threads: [thread({ id: THREAD_3, parentThreadId: THREAD_1 })],
        folderId: FOLDER_A,
      }),
    ).toBeNull();
  });
});

describe("buildFolderMoveMenuItems", () => {
  const folders = [
    { id: FOLDER_A, name: "Feature" },
    { id: FOLDER_B, name: "Spikes" },
  ];

  it("offers a non-pointer path for every batch target and suffixes the count", () => {
    const scope = resolveFolderMoveScope([thread({ id: THREAD_1 }), thread({ id: THREAD_2 })]);
    const items = buildFolderMoveMenuItems({ scope, folders });

    expect(items.map((item) => item.label)).toEqual([
      "Move to “Feature” (2)",
      "Move to “Spikes” (2)",
      "Group into new folder… (2)",
    ]);
    expect(items[0]?.separatorBefore).toBe(true);
  });

  it("hides targets every thread already sits in", () => {
    const scope = resolveFolderMoveScope([
      thread({ id: THREAD_1, folderId: FOLDER_A }),
      thread({ id: THREAD_2, folderId: FOLDER_A }),
    ]);

    expect(buildFolderMoveMenuItems({ scope, folders }).map((item) => item.label)).toEqual([
      "Move out of folder (2)",
      "Move to “Spikes” (2)",
      "Group into new folder… (2)",
    ]);
  });

  it("returns nothing without a scope so cross-project selections have no folder path", () => {
    expect(buildFolderMoveMenuItems({ scope: null, folders })).toEqual([]);
  });
});

describe("parseFolderMoveMenuId", () => {
  it("round-trips the ids produced by the builder", () => {
    const scope = resolveFolderMoveScope([thread({ id: THREAD_1, folderId: FOLDER_B })]);
    const items = buildFolderMoveMenuItems({
      scope,
      folders: [{ id: FOLDER_A, name: "Feature" }],
    });

    expect(items.map((item) => parseFolderMoveMenuId(item.id))).toEqual([
      { kind: "unfile" },
      { kind: "folder", folderId: FOLDER_A },
      { kind: "new-folder" },
    ]);
  });

  it("ignores unrelated menu ids", () => {
    expect(parseFolderMoveMenuId("archive")).toBeNull();
    expect(parseFolderMoveMenuId("move-folder:")).toBeNull();
  });
});

describe("moveThreadsToFolder", () => {
  it("dispatches one membership update per thread", async () => {
    const dispatchCommand = vi.fn().mockResolvedValue({ sequence: 1 });

    const outcome = await moveThreadsToFolder({
      api: makeApi(dispatchCommand),
      threadIds: [THREAD_1, THREAD_2],
      folderId: FOLDER_A,
    });

    expect(outcome).toEqual({ movedThreadIds: [THREAD_1, THREAD_2], failures: [] });
    expect(dispatchCommand).toHaveBeenCalledTimes(2);
    expect(dispatchCommand.mock.calls[0]?.[0]).toMatchObject({
      type: "thread.meta.update",
      threadId: THREAD_1,
      folderId: FOLDER_A,
    });
  });

  it("keeps going after a rejected thread and reports it", async () => {
    const dispatchCommand = vi
      .fn()
      .mockRejectedValueOnce(new Error("folder does not belong to project"))
      .mockResolvedValueOnce({ sequence: 2 });

    const outcome = await moveThreadsToFolder({
      api: makeApi(dispatchCommand),
      threadIds: [THREAD_1, THREAD_2],
      folderId: FOLDER_A,
    });

    expect(outcome.movedThreadIds).toEqual([THREAD_2]);
    expect(outcome.failures).toEqual([
      { threadId: THREAD_1, message: "folder does not belong to project" },
    ]);
  });
});

describe("groupThreadsIntoNewFolder", () => {
  it("creates the folder before moving the batch into it", async () => {
    const dispatchCommand = vi.fn().mockResolvedValue({ sequence: 1 });

    const result = await groupThreadsIntoNewFolder({
      api: makeApi(dispatchCommand),
      owner: projectFolderOwner(PROJECT_A),
      name: "Feature",
      threadIds: [THREAD_1, THREAD_2],
    });

    expect(dispatchCommand.mock.calls[0]?.[0]).toMatchObject({
      type: "folder.create",
      owner: projectFolderOwner(PROJECT_A),
      name: "Feature",
      folderId: result.folderId,
    });
    expect(dispatchCommand.mock.calls[1]?.[0]).toMatchObject({
      type: "thread.meta.update",
      threadId: THREAD_1,
      folderId: result.folderId,
    });
    expect(result.movedThreadIds).toEqual([THREAD_1, THREAD_2]);
  });

  it("propagates a failed folder creation instead of moving threads", async () => {
    const dispatchCommand = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(
      groupThreadsIntoNewFolder({
        api: makeApi(dispatchCommand),
        owner: projectFolderOwner(PROJECT_A),
        name: "Feature",
        threadIds: [THREAD_1],
      }),
    ).rejects.toThrow("offline");
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
  });
});

describe("describeFolderMoveOutcome", () => {
  it("stays silent for a fully applied single move", () => {
    expect(
      describeFolderMoveOutcome({
        outcome: { movedThreadIds: [THREAD_1], failures: [] },
        folderName: "Feature",
      }),
    ).toBeNull();
  });

  it("confirms a fully applied batch", () => {
    expect(
      describeFolderMoveOutcome({
        outcome: { movedThreadIds: [THREAD_1, THREAD_2], failures: [] },
        folderName: "Feature",
      }),
    ).toEqual({ type: "success", title: "Moved 2 threads to “Feature”" });
  });

  it("reports a partially applied batch with the moved and failed counts", () => {
    expect(
      describeFolderMoveOutcome({
        outcome: {
          movedThreadIds: [THREAD_1],
          failures: [{ threadId: THREAD_2, message: "rejected" }],
        },
        folderName: null,
      }),
    ).toEqual({
      type: "error",
      title: "Moved 1 of 2 threads out of folders",
      description: "1 thread could not be moved. rejected",
    });
  });

  it("reports a fully failed move as an error", () => {
    expect(
      describeFolderMoveOutcome({
        outcome: { movedThreadIds: [], failures: [{ threadId: THREAD_1, message: "rejected" }] },
        folderName: "Feature",
      }),
    ).toEqual({ type: "error", title: "Unable to move thread", description: "rejected" });
  });
});
