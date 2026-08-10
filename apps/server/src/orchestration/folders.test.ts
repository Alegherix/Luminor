import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  FolderId,
  ProjectId,
  ThreadId,
  type OrchestrationCommand,
} from "@luminor/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

async function dispatch(
  readModel: ReturnType<typeof createEmptyReadModel>,
  command: OrchestrationCommand,
) {
  const decided = await Effect.runPromise(decideOrchestrationCommand({ command, readModel }));
  const eventBases = Array.isArray(decided) ? decided : [decided];
  let next = readModel;
  for (const eventBase of eventBases) {
    next = await Effect.runPromise(
      projectEvent(next, { ...eventBase, sequence: next.snapshotSequence + 1 }),
    );
  }
  return { events: eventBases, readModel: next };
}

describe("Folders", () => {
  it("projects create, rename, and delete commands into the read model", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-folders");
    const folderId = FolderId.makeUnsafe("folder-lifecycle");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Luminor",
      workspaceRoot: "/tmp/luminor",
      createdAt,
    }));

    const creation = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-folder-create"),
      folderId,
      projectId,
      name: "Feature work",
      createdAt,
    });
    readModel = creation.readModel;
    expect(creation.events.map((event) => event.type)).toEqual(["folder.created"]);
    expect(readModel.folders).toEqual([
      expect.objectContaining({
        id: folderId,
        projectId,
        name: "Feature work",
        sortOrder: 0,
        isPinned: false,
        deletedAt: null,
      }),
    ]);

    const rename = await dispatch(readModel, {
      type: "folder.rename",
      commandId: CommandId.makeUnsafe("cmd-folder-rename"),
      folderId,
      name: "Ready for review",
    });
    readModel = rename.readModel;
    expect(rename.events.map((event) => event.type)).toEqual(["folder.renamed"]);
    expect(readModel.folders[0]?.name).toBe("Ready for review");

    const deletion = await dispatch(readModel, {
      type: "folder.delete",
      commandId: CommandId.makeUnsafe("cmd-folder-delete"),
      folderId,
    });
    expect(deletion.events.map((event) => event.type)).toEqual(["folder.deleted"]);
    expect(deletion.readModel.folders[0]?.deletedAt).not.toBeNull();
  });

  it("enforces active projects and case-insensitive sibling names", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-folders");
    let readModel = createEmptyReadModel(createdAt);
    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Luminor",
      workspaceRoot: "/tmp/luminor",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-folder-create"),
      folderId: FolderId.makeUnsafe("folder-first"),
      projectId,
      name: "Planning",
      createdAt,
    }));

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "folder.create",
            commandId: CommandId.makeUnsafe("cmd-folder-duplicate"),
            folderId: FolderId.makeUnsafe("folder-second"),
            projectId,
            name: "planning",
            createdAt,
          },
          readModel,
        }),
      ),
    ).rejects.toThrow(/already exists/i);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "folder.create",
            commandId: CommandId.makeUnsafe("cmd-folder-missing-project"),
            folderId: FolderId.makeUnsafe("folder-missing-project"),
            projectId: ProjectId.makeUnsafe("missing-project"),
            name: "Missing",
            createdAt,
          },
          readModel,
        }),
      ),
    ).rejects.toThrow(/does not exist/i);
  });

  it("moves an existing Thread into, between, and out of same-project Folders", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-membership");
    const threadId = ThreadId.makeUnsafe("thread-membership");
    const firstFolderId = FolderId.makeUnsafe("folder-first");
    const secondFolderId = FolderId.makeUnsafe("folder-second");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Luminor",
      workspaceRoot: "/tmp/luminor-membership",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "thread.create",
      commandId: CommandId.makeUnsafe("cmd-thread-create"),
      threadId,
      projectId,
      title: "Membership",
      modelSelection: { provider: "codex", model: "gpt-5.6-sol" },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "approval-required",
      branch: null,
      worktreePath: null,
      createdAt,
    }));
    expect(readModel.threads[0]?.folderId ?? null).toBeNull();

    for (const [folderId, name] of [
      [firstFolderId, "First"],
      [secondFolderId, "Second"],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "folder.create",
        commandId: CommandId.makeUnsafe(`cmd-${folderId}`),
        folderId,
        projectId,
        name,
        createdAt,
      }));
    }

    ({ readModel } = await dispatch(readModel, {
      type: "thread.meta.update",
      commandId: CommandId.makeUnsafe("cmd-move-first"),
      threadId,
      folderId: firstFolderId,
    }));
    expect(readModel.threads[0]?.folderId).toBe(firstFolderId);

    ({ readModel } = await dispatch(readModel, {
      type: "thread.meta.update",
      commandId: CommandId.makeUnsafe("cmd-move-second"),
      threadId,
      folderId: secondFolderId,
    }));
    expect(readModel.threads[0]?.folderId).toBe(secondFolderId);

    ({ readModel } = await dispatch(readModel, {
      type: "thread.meta.update",
      commandId: CommandId.makeUnsafe("cmd-unfile"),
      threadId,
      folderId: null,
    }));
    expect(readModel.threads[0]?.folderId).toBeNull();
  });

  it("rejects cross-project membership and unfiles members when deleting a Folder", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const firstProjectId = ProjectId.makeUnsafe("project-first");
    const secondProjectId = ProjectId.makeUnsafe("project-second");
    const threadId = ThreadId.makeUnsafe("thread-first");
    const firstFolderId = FolderId.makeUnsafe("folder-first");
    const crossProjectFolderId = FolderId.makeUnsafe("folder-cross-project");
    let readModel = createEmptyReadModel(createdAt);

    for (const [projectId, workspaceRoot] of [
      [firstProjectId, "/tmp/project-first"],
      [secondProjectId, "/tmp/project-second"],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "project.create",
        commandId: CommandId.makeUnsafe(`cmd-${projectId}`),
        projectId,
        title: projectId,
        workspaceRoot,
        createdAt,
      }));
    }
    ({ readModel } = await dispatch(readModel, {
      type: "thread.create",
      commandId: CommandId.makeUnsafe("cmd-thread-create"),
      threadId,
      projectId: firstProjectId,
      title: "First project Thread",
      modelSelection: { provider: "codex", model: "gpt-5.6-sol" },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "approval-required",
      branch: null,
      worktreePath: null,
      createdAt,
    }));
    for (const [folderId, projectId] of [
      [firstFolderId, firstProjectId],
      [crossProjectFolderId, secondProjectId],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "folder.create",
        commandId: CommandId.makeUnsafe(`cmd-${folderId}`),
        folderId,
        projectId,
        name: folderId,
        createdAt,
      }));
    }

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "thread.meta.update",
            commandId: CommandId.makeUnsafe("cmd-cross-project-move"),
            threadId,
            folderId: crossProjectFolderId,
          },
          readModel,
        }),
      ),
    ).rejects.toThrow(/does not belong/i);
    expect(readModel.threads[0]?.folderId ?? null).toBeNull();

    ({ readModel } = await dispatch(readModel, {
      type: "thread.meta.update",
      commandId: CommandId.makeUnsafe("cmd-file-thread"),
      threadId,
      folderId: firstFolderId,
    }));
    const deletion = await dispatch(readModel, {
      type: "folder.delete",
      commandId: CommandId.makeUnsafe("cmd-delete-folder"),
      folderId: firstFolderId,
    });
    expect(deletion.events.map((event) => event.type)).toEqual([
      "thread.meta-updated",
      "folder.deleted",
    ]);
    expect(deletion.readModel.threads[0]).toMatchObject({
      folderId: null,
      archivedAt: null,
      deletedAt: null,
    });
    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "thread.meta.update",
            commandId: CommandId.makeUnsafe("cmd-move-to-deleted-folder"),
            threadId,
            folderId: firstFolderId,
          },
          readModel: deletion.readModel,
        }),
      ),
    ).rejects.toThrow(/was deleted/i);
  });

  it("cleans project Folders and membership when the Project is deleted", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const deletedProjectId = ProjectId.makeUnsafe("project-deleted");
    const keptProjectId = ProjectId.makeUnsafe("project-kept");
    const deletedFolderId = FolderId.makeUnsafe("folder-deleted-project");
    const keptFolderId = FolderId.makeUnsafe("folder-kept-project");
    const deletedThreadId = ThreadId.makeUnsafe("thread-deleted-project");
    const keptThreadId = ThreadId.makeUnsafe("thread-kept-project");
    let readModel = createEmptyReadModel(createdAt);

    for (const [projectId, workspaceRoot] of [
      [deletedProjectId, "/tmp/project-deleted"],
      [keptProjectId, "/tmp/project-kept"],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "project.create",
        commandId: CommandId.makeUnsafe(`cmd-${projectId}`),
        projectId,
        title: projectId,
        workspaceRoot,
        createdAt,
      }));
    }

    for (const [folderId, projectId] of [
      [deletedFolderId, deletedProjectId],
      [keptFolderId, keptProjectId],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "folder.create",
        commandId: CommandId.makeUnsafe(`cmd-${folderId}`),
        folderId,
        projectId,
        name: folderId,
        createdAt,
      }));
    }

    for (const [threadId, projectId, folderId] of [
      [deletedThreadId, deletedProjectId, deletedFolderId],
      [keptThreadId, keptProjectId, keptFolderId],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "thread.create",
        commandId: CommandId.makeUnsafe(`cmd-${threadId}-create`),
        threadId,
        projectId,
        title: threadId,
        modelSelection: { provider: "codex", model: "gpt-5.6-sol" },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt,
      }));
      ({ readModel } = await dispatch(readModel, {
        type: "thread.meta.update",
        commandId: CommandId.makeUnsafe(`cmd-${threadId}-file`),
        threadId,
        folderId,
      }));
    }

    ({ readModel } = await dispatch(readModel, {
      type: "thread.delete",
      commandId: CommandId.makeUnsafe("cmd-thread-delete"),
      threadId: deletedThreadId,
    }));
    expect(readModel.threads.find((thread) => thread.id === deletedThreadId)).toMatchObject({
      folderId: deletedFolderId,
      deletedAt: expect.any(String),
    });

    const deletion = await dispatch(readModel, {
      type: "project.delete",
      commandId: CommandId.makeUnsafe("cmd-project-delete"),
      projectId: deletedProjectId,
    });
    expect(deletion.events.map((event) => event.type)).toEqual(["project.deleted"]);
    expect(
      deletion.readModel.folders.find((folder) => folder.id === deletedFolderId),
    ).toMatchObject({
      deletedAt: expect.any(String),
    });
    expect(deletion.readModel.folders.find((folder) => folder.id === keptFolderId)).toMatchObject({
      deletedAt: null,
    });
    expect(
      deletion.readModel.threads.find((thread) => thread.id === deletedThreadId),
    ).toMatchObject({
      folderId: null,
      deletedAt: expect.any(String),
    });
    expect(deletion.readModel.threads.find((thread) => thread.id === keptThreadId)).toMatchObject({
      folderId: keptFolderId,
      deletedAt: null,
    });
    expect(
      deletion.readModel.folders.filter(
        (folder) => folder.projectId === deletedProjectId && folder.deletedAt === null,
      ),
    ).toEqual([]);
  });
});
