import { CommandId, FolderId, ProjectId, type OrchestrationCommand } from "@luminor/contracts";
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
});
