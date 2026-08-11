// FILE: threadFolderMoves.test.ts
// Purpose: Cover thread→folder move eligibility, menu construction, batching, and partial-failure reporting.
// Layer: Web client helper test
// Targets: resolveFolderMoveScope, planFolderMove, buildFolderMoveMenuItems, parseFolderMoveMenuId, moveThreadsToFolder, groupThreadsIntoNewFolder, describeFolderMoveOutcome.

import { FolderId, ProjectId, ThreadId, type NativeApi } from "@luminor/contracts";
import { projectFolderOwner } from "@luminor/shared/folderOwnership";
import { describe, expect, it, vi } from "vitest";

import {
  buildFolderMoveMenuItems,
  describeFolderMoveOutcome,
  groupThreadsIntoNewFolder,
  moveThreadsToFolder,
  parseFolderMoveMenuId,
  planFolderMove,
  resolveFolderMoveScope,
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
    expect(scope?.projectId).toBe(PROJECT_A);
    expect(scope?.threadIds).toEqual([THREAD_1, THREAD_2]);
    expect(scope?.skippedThreadIds).toEqual([THREAD_3]);
    expect([...(scope?.folderIds ?? [])]).toEqual([null, FOLDER_A]);
  });

  it("rejects a selection spanning projects instead of moving part of it", () => {
    expect(
      resolveFolderMoveScope([
        thread({ id: THREAD_1 }),
        thread({ id: THREAD_2, projectId: PROJECT_B }),
      ]),
    ).toBeNull();
  });

  it("rejects a selection of only subagent rows", () => {
    expect(resolveFolderMoveScope([thread({ id: THREAD_3, parentThreadId: THREAD_1 })])).toBeNull();
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

  it("returns no plan for a cross-project selection", () => {
    expect(
      planFolderMove({
        threads: [thread({ id: THREAD_1 }), thread({ id: THREAD_2, projectId: PROJECT_B })],
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
