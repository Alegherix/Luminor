import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  FolderId,
  ProjectId,
  SpaceId,
  ThreadId,
  type OrchestrationCommand,
} from "@luminor/contracts";
import { Effect } from "effect";
import {
  projectFolderOwner,
  spaceFolderOwner,
  folderOwnersEqual,
} from "@luminor/shared/folderOwnership";
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

function threadCreateCommand(input: {
  commandId: string;
  threadId: ThreadId;
  projectId: ProjectId;
  title: string;
  createdAt: string;
}): Extract<OrchestrationCommand, { type: "thread.create" }> {
  return {
    type: "thread.create",
    commandId: CommandId.makeUnsafe(input.commandId),
    threadId: input.threadId,
    projectId: input.projectId,
    title: input.title,
    modelSelection: { provider: "codex", model: "gpt-5.6-sol" },
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    runtimeMode: "approval-required",
    branch: null,
    worktreePath: null,
    createdAt: input.createdAt,
  };
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
      owner: projectFolderOwner(projectId),
      name: "Feature work",
      createdAt,
    });
    readModel = creation.readModel;
    expect(creation.events.map((event) => event.type)).toEqual(["folder.created"]);
    expect(readModel.folders).toEqual([
      expect.objectContaining({
        id: folderId,
        owner: projectFolderOwner(projectId),
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
      owner: projectFolderOwner(projectId),
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
            owner: projectFolderOwner(projectId),
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
            owner: projectFolderOwner(ProjectId.makeUnsafe("missing-project")),
            name: "Missing",
            createdAt,
          },
          readModel,
        }),
      ),
    ).rejects.toThrow(/does not exist/i);
  });

  it("creates and projects folders owned by active spaces", async () => {
    const createdAt = "2026-08-11T10:00:00.000Z";
    const workSpaceId = SpaceId.makeUnsafe("space-work-folders");
    const personalSpaceId = SpaceId.makeUnsafe("space-personal-folders");
    let readModel = createEmptyReadModel(createdAt);

    for (const [spaceId, name] of [
      [workSpaceId, "Work"],
      [personalSpaceId, "Personal"],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "space.create",
        commandId: CommandId.makeUnsafe(`cmd-create-${spaceId}`),
        spaceId,
        name,
        icon: "bag",
        createdAt,
      }));
    }

    const creation = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-create-work-folder"),
      folderId: FolderId.makeUnsafe("folder-work-feature"),
      owner: spaceFolderOwner(workSpaceId),
      name: "Cross-repo feature",
      createdAt,
    });
    readModel = creation.readModel;

    expect(creation.events).toEqual([
      expect.objectContaining({
        type: "folder.created",
        payload: expect.objectContaining({ owner: spaceFolderOwner(workSpaceId) }),
      }),
    ]);
    expect(readModel.folders).toEqual([
      expect.objectContaining({
        owner: spaceFolderOwner(workSpaceId),
        name: "Cross-repo feature",
        sortOrder: 0,
      }),
    ]);

    const otherSpace = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-create-personal-folder"),
      folderId: FolderId.makeUnsafe("folder-personal-feature"),
      owner: spaceFolderOwner(personalSpaceId),
      name: "Cross-repo feature",
      createdAt,
    });
    expect(otherSpace.readModel.folders).toHaveLength(2);

    await expect(
      dispatch(readModel, {
        type: "folder.create",
        commandId: CommandId.makeUnsafe("cmd-create-duplicate-work-folder"),
        folderId: FolderId.makeUnsafe("folder-work-duplicate"),
        owner: spaceFolderOwner(workSpaceId),
        name: "cross-repo feature",
        createdAt,
      }),
    ).rejects.toThrow(/already exists/i);

    await expect(
      dispatch(readModel, {
        type: "folder.create",
        commandId: CommandId.makeUnsafe("cmd-create-missing-space-folder"),
        folderId: FolderId.makeUnsafe("folder-missing-space"),
        owner: spaceFolderOwner(SpaceId.makeUnsafe("space-missing")),
        name: "Missing",
        createdAt,
      }),
    ).rejects.toThrow(/does not exist/i);
  });

  it("renames, pins, reorders, and deletes space-owned folders with owner-scoped rules", async () => {
    const createdAt = "2026-08-11T12:00:00.000Z";
    const spaceId = SpaceId.makeUnsafe("space-lifecycle");
    const projectId = ProjectId.makeUnsafe("project-lifecycle");
    const firstFolderId = FolderId.makeUnsafe("folder-space-first");
    const secondFolderId = FolderId.makeUnsafe("folder-space-second");
    const projectFolderId = FolderId.makeUnsafe("folder-project-same-name");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "space.create",
      commandId: CommandId.makeUnsafe("cmd-space-create"),
      spaceId,
      name: "Work",
      icon: "bag",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Backend",
      workspaceRoot: "/tmp/backend-lifecycle",
      createdAt,
    }));

    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-create-first-space-folder"),
      folderId: firstFolderId,
      owner: spaceFolderOwner(spaceId),
      name: "Auth",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-create-second-space-folder"),
      folderId: secondFolderId,
      owner: spaceFolderOwner(spaceId),
      name: "Billing",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-create-project-folder"),
      folderId: projectFolderId,
      owner: projectFolderOwner(projectId),
      name: "Auth",
      createdAt,
    }));

    const spaceFolders = readModel.folders
      .filter((folder) => folderOwnersEqual(folder.owner, spaceFolderOwner(spaceId)))
      .toSorted((left, right) => left.sortOrder - right.sortOrder);
    expect(spaceFolders.map((folder) => [folder.id, folder.sortOrder, folder.name])).toEqual([
      [firstFolderId, 0, "Auth"],
      [secondFolderId, 1, "Billing"],
    ]);
    expect(readModel.folders.find((folder) => folder.id === projectFolderId)).toMatchObject({
      name: "Auth",
      owner: projectFolderOwner(projectId),
    });

    const rename = await dispatch(readModel, {
      type: "folder.rename",
      commandId: CommandId.makeUnsafe("cmd-rename-space-folder"),
      folderId: firstFolderId,
      name: "Authentication",
    });
    readModel = rename.readModel;
    expect(rename.events.map((event) => event.type)).toEqual(["folder.renamed"]);
    expect(readModel.folders.find((folder) => folder.id === firstFolderId)?.name).toBe(
      "Authentication",
    );

    await expect(
      dispatch(readModel, {
        type: "folder.rename",
        commandId: CommandId.makeUnsafe("cmd-rename-space-folder-conflict"),
        folderId: firstFolderId,
        name: "billing",
      }),
    ).rejects.toThrow(/already exists/i);

    await expect(
      dispatch(readModel, {
        type: "folder.create",
        commandId: CommandId.makeUnsafe("cmd-create-space-folder-conflict"),
        folderId: FolderId.makeUnsafe("folder-space-duplicate"),
        owner: spaceFolderOwner(spaceId),
        name: "authentication",
        createdAt,
      }),
    ).rejects.toThrow(/already exists/i);

    const pinSecond = await dispatch(readModel, {
      type: "folder.pin",
      commandId: CommandId.makeUnsafe("cmd-pin-second"),
      folderId: secondFolderId,
      isPinned: true,
    });
    readModel = pinSecond.readModel;
    const pinFirst = await dispatch(readModel, {
      type: "folder.pin",
      commandId: CommandId.makeUnsafe("cmd-pin-first"),
      folderId: firstFolderId,
      isPinned: true,
    });
    readModel = pinFirst.readModel;

    const orderedSpaceFolders = readModel.folders
      .filter(
        (folder) =>
          folderOwnersEqual(folder.owner, spaceFolderOwner(spaceId)) && folder.deletedAt === null,
      )
      .toSorted(
        (left, right) =>
          Number(right.isPinned) - Number(left.isPinned) ||
          left.sortOrder - right.sortOrder ||
          left.id.localeCompare(right.id),
      );
    expect(
      orderedSpaceFolders.map((folder) => [folder.id, folder.isPinned, folder.sortOrder]),
    ).toEqual([
      [firstFolderId, true, 0],
      [secondFolderId, true, 1],
    ]);

    const unpinSecond = await dispatch(readModel, {
      type: "folder.pin",
      commandId: CommandId.makeUnsafe("cmd-unpin-second"),
      folderId: secondFolderId,
      isPinned: false,
    });
    readModel = unpinSecond.readModel;
    expect(readModel.folders.find((folder) => folder.id === secondFolderId)?.isPinned).toBe(false);
    expect(readModel.folders.find((folder) => folder.id === firstFolderId)?.isPinned).toBe(true);

    const deletion = await dispatch(readModel, {
      type: "folder.delete",
      commandId: CommandId.makeUnsafe("cmd-delete-space-folder"),
      folderId: firstFolderId,
    });
    readModel = deletion.readModel;
    expect(deletion.events.map((event) => event.type)).toEqual(["folder.deleted"]);
    expect(
      readModel.folders.find((folder) => folder.id === firstFolderId)?.deletedAt,
    ).not.toBeNull();
    expect(readModel.folders.find((folder) => folder.id === secondFolderId)?.deletedAt).toBeNull();
    expect(readModel.folders.find((folder) => folder.id === projectFolderId)?.deletedAt).toBeNull();
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
        owner: projectFolderOwner(projectId),
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
        owner: projectFolderOwner(projectId),
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
        owner: projectFolderOwner(projectId),
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
        (folder) =>
          folderOwnersEqual(folder.owner, projectFolderOwner(deletedProjectId)) &&
          folder.deletedAt === null,
      ),
    ).toEqual([]);
  });

  it("pins and unpins a Folder without touching Thread pins", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-pin");
    const folderId = FolderId.makeUnsafe("folder-pin");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Luminor",
      workspaceRoot: "/tmp/luminor-pin",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-folder-create"),
      folderId,
      owner: projectFolderOwner(projectId),
      name: "Radar",
      createdAt,
    }));
    expect(readModel.folders[0]?.isPinned).toBe(false);

    const pin = await dispatch(readModel, {
      type: "folder.pin",
      commandId: CommandId.makeUnsafe("cmd-folder-pin"),
      folderId,
      isPinned: true,
    });
    readModel = pin.readModel;
    expect(pin.events.map((event) => event.type)).toEqual(["folder.pinned"]);
    expect(readModel.folders[0]?.isPinned).toBe(true);

    ({ readModel } = await dispatch(readModel, {
      type: "folder.pin",
      commandId: CommandId.makeUnsafe("cmd-folder-pin-again"),
      folderId,
      isPinned: true,
    }));
    expect(readModel.folders[0]?.isPinned).toBe(true);

    ({ readModel } = await dispatch(readModel, {
      type: "folder.pin",
      commandId: CommandId.makeUnsafe("cmd-folder-unpin"),
      folderId,
      isPinned: false,
    }));
    expect(readModel.folders[0]?.isPinned).toBe(false);
  });

  it("auto-unpins a pinned Folder once its last member Thread leaves", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-auto-unpin");
    const folderId = FolderId.makeUnsafe("folder-auto-unpin");
    const stayingThreadId = ThreadId.makeUnsafe("thread-staying");
    const leavingThreadId = ThreadId.makeUnsafe("thread-leaving");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Luminor",
      workspaceRoot: "/tmp/luminor-auto-unpin",
      createdAt,
    }));
    for (const threadId of [stayingThreadId, leavingThreadId]) {
      ({ readModel } = await dispatch(readModel, {
        type: "thread.create",
        commandId: CommandId.makeUnsafe(`cmd-create-${threadId}`),
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
    }
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-folder-create"),
      folderId,
      owner: projectFolderOwner(projectId),
      name: "Radar",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "folder.pin",
      commandId: CommandId.makeUnsafe("cmd-folder-pin"),
      folderId,
      isPinned: true,
    }));
    for (const threadId of [stayingThreadId, leavingThreadId]) {
      ({ readModel } = await dispatch(readModel, {
        type: "thread.meta.update",
        commandId: CommandId.makeUnsafe(`cmd-file-${threadId}`),
        threadId,
        folderId,
      }));
    }
    expect(readModel.folders[0]?.isPinned).toBe(true);

    const move = await dispatch(readModel, {
      type: "thread.meta.update",
      commandId: CommandId.makeUnsafe("cmd-move-out"),
      threadId: leavingThreadId,
      folderId: null,
    });
    readModel = move.readModel;
    expect(move.events.map((event) => event.type)).toEqual(["thread.meta-updated"]);
    expect(readModel.folders[0]?.isPinned).toBe(true);

    const deletion = await dispatch(readModel, {
      type: "thread.delete",
      commandId: CommandId.makeUnsafe("cmd-delete-last-member"),
      threadId: stayingThreadId,
    });
    readModel = deletion.readModel;
    expect(deletion.events.map((event) => event.type)).toEqual(["folder.pinned", "thread.deleted"]);
    expect(readModel.folders[0]).toMatchObject({ id: folderId, isPinned: false, deletedAt: null });
  });

  it("creates threads unfiled by default and inside a same-project Folder on request", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-create-in-folder");
    const folderId = FolderId.makeUnsafe("folder-create-target");
    const unfiledThreadId = ThreadId.makeUnsafe("thread-unfiled");
    const filedThreadId = ThreadId.makeUnsafe("thread-filed");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Luminor",
      workspaceRoot: "/tmp/luminor-create-in-folder",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-folder-create"),
      folderId,
      owner: projectFolderOwner(projectId),
      name: "Feature work",
      createdAt,
    }));

    ({ readModel } = await dispatch(readModel, {
      ...threadCreateCommand({
        commandId: "cmd-thread-unfiled",
        threadId: unfiledThreadId,
        projectId,
        title: "Unfiled",
        createdAt,
      }),
    }));
    expect(readModel.threads.find((thread) => thread.id === unfiledThreadId)?.folderId).toBeNull();

    const filedCreation = await dispatch(readModel, {
      ...threadCreateCommand({
        commandId: "cmd-thread-filed",
        threadId: filedThreadId,
        projectId,
        title: "Filed",
        createdAt,
      }),
      folderId,
    });
    readModel = filedCreation.readModel;
    expect(filedCreation.events[0]?.payload).toMatchObject({ folderId });
    expect(readModel.threads.find((thread) => thread.id === filedThreadId)?.folderId).toBe(
      folderId,
    );
  });

  it("rejects creating a Thread in a missing or cross-project Folder", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-create-reject");
    const otherProjectId = ProjectId.makeUnsafe("project-create-reject-other");
    const otherProjectFolderId = FolderId.makeUnsafe("folder-other-project");
    const threadId = ThreadId.makeUnsafe("thread-create-reject");
    let readModel = createEmptyReadModel(createdAt);

    for (const [id, workspaceRoot] of [
      [projectId, "/tmp/create-reject"],
      [otherProjectId, "/tmp/create-reject-other"],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "project.create",
        commandId: CommandId.makeUnsafe(`cmd-${id}`),
        projectId: id,
        title: id,
        workspaceRoot,
        createdAt,
      }));
    }
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-folder-other-project"),
      folderId: otherProjectFolderId,
      owner: projectFolderOwner(otherProjectId),
      name: "Other project folder",
      createdAt,
    }));

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            ...threadCreateCommand({
              commandId: "cmd-thread-missing-folder",
              threadId,
              projectId,
              title: "Missing folder",
              createdAt,
            }),
            folderId: FolderId.makeUnsafe("folder-missing"),
          },
          readModel,
        }),
      ),
    ).rejects.toThrow(/does not exist/i);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            ...threadCreateCommand({
              commandId: "cmd-thread-cross-project-folder",
              threadId,
              projectId,
              title: "Cross project folder",
              createdAt,
            }),
            folderId: otherProjectFolderId,
          },
          readModel,
        }),
      ),
    ).rejects.toThrow(/does not belong/i);

    expect(readModel.threads).toEqual([]);
  });

  it("inherits Folder membership for subagent and sidechat children", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const projectId = ProjectId.makeUnsafe("project-inherit");
    const folderId = FolderId.makeUnsafe("folder-inherit");
    const parentThreadId = ThreadId.makeUnsafe("thread-parent");
    const subagentThreadId = ThreadId.makeUnsafe("thread-subagent");
    const sidechatThreadId = ThreadId.makeUnsafe("thread-sidechat");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      projectId,
      title: "Luminor",
      workspaceRoot: "/tmp/luminor-inherit",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-folder-create"),
      folderId,
      owner: projectFolderOwner(projectId),
      name: "Feature work",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      ...threadCreateCommand({
        commandId: "cmd-thread-parent",
        threadId: parentThreadId,
        projectId,
        title: "Parent",
        createdAt,
      }),
      folderId,
    }));

    ({ readModel } = await dispatch(readModel, {
      ...threadCreateCommand({
        commandId: "cmd-thread-subagent",
        threadId: subagentThreadId,
        projectId,
        title: "Subagent",
        createdAt,
      }),
      parentThreadId,
      subagentAgentId: "builder",
    }));
    expect(readModel.threads.find((thread) => thread.id === subagentThreadId)).toMatchObject({
      folderId,
      parentThreadId,
    });

    ({ readModel } = await dispatch(readModel, {
      type: "thread.fork.create",
      commandId: CommandId.makeUnsafe("cmd-thread-sidechat"),
      threadId: sidechatThreadId,
      sourceThreadId: parentThreadId,
      projectId,
      title: "Sidechat",
      modelSelection: { provider: "codex", model: "gpt-5.6-sol" },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "approval-required",
      branch: null,
      worktreePath: null,
      sidechatSourceThreadId: parentThreadId,
      importedMessages: [],
      createdAt,
    }));
    expect(readModel.threads.find((thread) => thread.id === sidechatThreadId)?.folderId).toBe(
      folderId,
    );
  });

  it("files threads from several projects of a space into one space folder", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const spaceId = SpaceId.makeUnsafe("space-feature-work");
    const backendProjectId = ProjectId.makeUnsafe("project-backend");
    const frontendProjectId = ProjectId.makeUnsafe("project-frontend");
    const outsideProjectId = ProjectId.makeUnsafe("project-outside-space");
    const folderId = FolderId.makeUnsafe("folder-space-feature");
    const backendThreadId = ThreadId.makeUnsafe("thread-backend");
    const frontendThreadId = ThreadId.makeUnsafe("thread-frontend");
    const outsideThreadId = ThreadId.makeUnsafe("thread-outside-space");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "space.create",
      commandId: CommandId.makeUnsafe("cmd-space-create"),
      spaceId,
      name: "Feature work",
      icon: "bag",
      createdAt,
    }));
    for (const [projectId, threadId, title] of [
      [backendProjectId, backendThreadId, "Backend"],
      [frontendProjectId, frontendThreadId, "Frontend"],
      [outsideProjectId, outsideThreadId, "Outside"],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "project.create",
        commandId: CommandId.makeUnsafe(`cmd-create-${projectId}`),
        projectId,
        title,
        workspaceRoot: `/tmp/${projectId}`,
        createdAt,
      }));
      ({ readModel } = await dispatch(
        readModel,
        threadCreateCommand({
          commandId: `cmd-thread-${threadId}`,
          threadId,
          projectId,
          title,
          createdAt,
        }),
      ));
    }
    for (const projectId of [backendProjectId, frontendProjectId] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "project.meta.update",
        commandId: CommandId.makeUnsafe(`cmd-assign-${projectId}`),
        projectId,
        spaceId,
      }));
    }
    ({ readModel } = await dispatch(readModel, {
      type: "folder.create",
      commandId: CommandId.makeUnsafe("cmd-space-folder-create"),
      folderId,
      owner: spaceFolderOwner(spaceId),
      name: "Cross-repo feature",
      createdAt,
    }));

    for (const threadId of [backendThreadId, frontendThreadId] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "thread.meta.update",
        commandId: CommandId.makeUnsafe(`cmd-file-${threadId}`),
        threadId,
        folderId,
      }));
    }
    expect(
      readModel.threads
        .filter((thread) => thread.folderId === folderId)
        .map((thread) => [thread.id, thread.projectId]),
    ).toEqual([
      [backendThreadId, backendProjectId],
      [frontendThreadId, frontendProjectId],
    ]);

    await expect(
      Effect.runPromise(
        decideOrchestrationCommand({
          command: {
            type: "thread.meta.update",
            commandId: CommandId.makeUnsafe("cmd-file-outside-space"),
            threadId: outsideThreadId,
            folderId,
          },
          readModel,
        }),
      ),
    ).rejects.toThrow(/is not in this space/i);
    expect(
      readModel.threads.find((thread) => thread.id === outsideThreadId)?.folderId ?? null,
    ).toBeNull();
  });

  it("moves a Thread between project and space Folders in both directions without touching its project", async () => {
    const createdAt = "2026-08-10T10:00:00.000Z";
    const spaceId = SpaceId.makeUnsafe("space-matrix");
    const projectId = ProjectId.makeUnsafe("project-matrix");
    const threadId = ThreadId.makeUnsafe("thread-matrix");
    const projectFolderId = FolderId.makeUnsafe("folder-matrix-project");
    const spaceFolderId = FolderId.makeUnsafe("folder-matrix-space");
    let readModel = createEmptyReadModel(createdAt);

    ({ readModel } = await dispatch(readModel, {
      type: "space.create",
      commandId: CommandId.makeUnsafe("cmd-matrix-space"),
      spaceId,
      name: "Matrix",
      icon: "bag",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-matrix-project"),
      projectId,
      title: "Matrix",
      workspaceRoot: "/tmp/luminor-matrix",
      createdAt,
    }));
    ({ readModel } = await dispatch(readModel, {
      type: "project.meta.update",
      commandId: CommandId.makeUnsafe("cmd-matrix-assign"),
      projectId,
      spaceId,
    }));
    ({ readModel } = await dispatch(
      readModel,
      threadCreateCommand({
        commandId: "cmd-matrix-thread",
        threadId,
        projectId,
        title: "Matrix",
        createdAt,
      }),
    ));
    for (const [folderId, owner, name] of [
      [projectFolderId, projectFolderOwner(projectId), "Project folder"],
      [spaceFolderId, spaceFolderOwner(spaceId), "Space folder"],
    ] as const) {
      ({ readModel } = await dispatch(readModel, {
        type: "folder.create",
        commandId: CommandId.makeUnsafe(`cmd-matrix-${folderId}`),
        folderId,
        owner,
        name,
        createdAt,
      }));
    }

    const moveTargets = [projectFolderId, spaceFolderId, projectFolderId, null] as const;
    for (const [step, folderId] of moveTargets.entries()) {
      ({ readModel } = await dispatch(readModel, {
        type: "thread.meta.update",
        commandId: CommandId.makeUnsafe(`cmd-matrix-move-${step}`),
        threadId,
        folderId,
      }));
      const moved = readModel.threads.find((thread) => thread.id === threadId);
      expect(moved?.folderId ?? null).toBe(folderId);
      expect(moved?.projectId).toBe(projectId);
    }
  });
});
