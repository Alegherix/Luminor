import { randomUUID } from "node:crypto";

import {
  CommandId,
  FOLDER_NAME_MAX_LENGTH,
  FolderId,
  ProjectId,
  SpaceId,
  ThreadId,
  type FolderOwner,
  type OrchestrationFolderShell,
  type OrchestrationProjectShell,
  type RuntimeMode,
} from "@luminor/contracts";
import {
  describeFolderPlacementRejection,
  folderOwnersEqual,
  projectFolderOwner,
  resolveFolderPlacementRejection,
  spaceFolderOwner,
} from "@luminor/shared/folderOwnership";
import { Effect, Option } from "effect";

import {
  isOrdinaryProjectRow,
  type SpaceAssignmentWorkspacePaths,
} from "../orchestration/commandInvariants.ts";
import type { OrchestrationEngineShape } from "../orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { gatewayIsoNow } from "./creationUtils.ts";
import { mcpToolResultError, mcpToolResultJson } from "./protocol.ts";
import { errorText, readBooleanArg, readStringArg, ToolInputError } from "./toolInput.ts";
import {
  READ_ONLY_TOOL_ANNOTATIONS,
  WRITE_TOOL_ANNOTATIONS,
  type ToolEntry,
} from "./toolRuntime.ts";

export interface FolderToolsInput {
  readonly snapshotQuery: ProjectionSnapshotQueryShape;
  readonly orchestrationEngine: OrchestrationEngineShape;
  readonly requireThreadShell: (threadId: string) => Effect.Effect<
    {
      readonly id: string;
      readonly projectId: string;
      readonly runtimeMode: RuntimeMode;
      readonly envMode?: string | null | undefined;
    },
    unknown
  >;
  readonly assertCallerMayDriveThread: (
    caller: { readonly runtimeMode: RuntimeMode; readonly envMode?: string | null | undefined },
    target: {
      readonly id: string;
      readonly runtimeMode: RuntimeMode;
      readonly envMode?: string | null | undefined;
    },
  ) => Effect.Effect<void, ToolInputError>;
  readonly workspacePaths: SpaceAssignmentWorkspacePaths;
}

function folderNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function summarizeFolder(folder: OrchestrationFolderShell) {
  return {
    folderId: folder.id,
    name: folder.name,
    owner: folder.owner,
    isPinned: folder.isPinned,
    sortOrder: folder.sortOrder,
  };
}

function compareFolders(left: OrchestrationFolderShell, right: OrchestrationFolderShell): number {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return left.name.localeCompare(right.name);
}

function resolveCreateFolderOwner(input: {
  readonly projectId: string | undefined;
  readonly spaceId: string | undefined;
  readonly callerProjectId: string;
}): FolderOwner {
  if (input.projectId !== undefined && input.spaceId !== undefined) {
    throw new ToolInputError('Pass only one of "projectId" or "spaceId".');
  }
  if (input.spaceId !== undefined) {
    return spaceFolderOwner(SpaceId.makeUnsafe(input.spaceId));
  }
  return projectFolderOwner(ProjectId.makeUnsafe(input.projectId ?? input.callerProjectId));
}

function requireFolderAcceptsProjectFromSnapshot(input: {
  readonly folder: OrchestrationFolderShell;
  readonly project: OrchestrationProjectShell;
}): void {
  const rejection = resolveFolderPlacementRejection({
    owner: input.folder.owner,
    projectId: input.project.id,
    projectSpaceId: input.project.spaceId ?? null,
  });
  if (rejection === null) return;
  throw new ToolInputError(
    describeFolderPlacementRejection({
      rejection,
      projectName: input.project.title,
    }),
  );
}

export function makeFolderTools(input: FolderToolsInput): ReadonlyArray<ToolEntry> {
  const {
    snapshotQuery,
    orchestrationEngine,
    requireThreadShell,
    assertCallerMayDriveThread,
    workspacePaths,
  } = input;

  const requireProject = (projectId: string) =>
    snapshotQuery.getProjectShellById(ProjectId.makeUnsafe(projectId)).pipe(
      Effect.mapError((error) => new ToolInputError(errorText(error))),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(new ToolInputError(`Project "${projectId}" was not found.`)),
          onSome: Effect.succeed,
        }),
      ),
    );

  const listSpaces: ToolEntry = {
    requiredCapability: "thread:read",
    definition: {
      name: "luminor_list_spaces",
      description:
        "List Luminor spaces (id, name, icon). Use before creating a space-owned folder.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { title: "List Luminor spaces", ...READ_ONLY_TOOL_ANNOTATIONS },
    },
    handler: () =>
      snapshotQuery.getShellSnapshot().pipe(
        Effect.map((snapshot) =>
          mcpToolResultJson({
            spaces: snapshot.spaces
              .toSorted((left, right) => left.sortOrder - right.sortOrder)
              .map((space) => ({
                spaceId: space.id,
                name: space.name,
                icon: space.icon,
                sortOrder: space.sortOrder,
              })),
          }),
        ),
        Effect.catch((error) => Effect.succeed(mcpToolResultError(errorText(error)))),
      ),
  };

  const listFolders: ToolEntry = {
    requiredCapability: "thread:read",
    definition: {
      name: "luminor_list_folders",
      description:
        "List Luminor folders. Project folders belong to one project; space folders can hold threads from any project in that space. Omit both filters to list the caller's project folders plus that project's space folders.",
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Only folders owned by this project." },
          spaceId: { type: "string", description: "Only folders owned by this space." },
          nameContains: { type: "string", description: "Case-insensitive folder name substring." },
        },
        additionalProperties: false,
      },
      annotations: { title: "List Luminor folders", ...READ_ONLY_TOOL_ANNOTATIONS },
    },
    handler: (args, context) =>
      Effect.gen(function* () {
        const projectId = readStringArg(args, "projectId");
        const spaceId = readStringArg(args, "spaceId");
        const nameContains = readStringArg(args, "nameContains")?.toLocaleLowerCase();
        const [caller, snapshot] = yield* Effect.all([
          requireThreadShell(context.callerThreadId),
          snapshotQuery
            .getShellSnapshot()
            .pipe(Effect.mapError((error) => new ToolInputError(errorText(error)))),
        ]);
        const callerProject = yield* requireProject(caller.projectId);
        const owners: FolderOwner[] = [];
        if (projectId !== undefined) {
          owners.push(projectFolderOwner(ProjectId.makeUnsafe(projectId)));
        }
        if (spaceId !== undefined) {
          owners.push(spaceFolderOwner(SpaceId.makeUnsafe(spaceId)));
        }
        if (owners.length === 0) {
          owners.push(projectFolderOwner(ProjectId.makeUnsafe(caller.projectId)));
          if (callerProject.spaceId) {
            owners.push(spaceFolderOwner(callerProject.spaceId));
          }
        }
        const folders = snapshot.folders
          .filter((folder) => owners.some((owner) => folderOwnersEqual(folder.owner, owner)))
          .filter((folder) =>
            nameContains ? folder.name.toLocaleLowerCase().includes(nameContains) : true,
          )
          .toSorted(compareFolders)
          .map(summarizeFolder);
        return mcpToolResultJson({ folders });
      }).pipe(Effect.catch((error) => Effect.succeed(mcpToolResultError(errorText(error))))),
  };

  const createFolder: ToolEntry = {
    requiredCapability: "thread:write",
    requiresActiveTurn: true,
    definition: {
      name: "luminor_create_folder",
      description:
        "Create a Luminor folder, or return the existing one with the same name under that owner. Pass projectId for a project folder, spaceId for a space folder, or omit both to create under the caller's project. Then pass the returned folderId to luminor_create_thread(s) so an epic or batch stays together.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            maxLength: FOLDER_NAME_MAX_LENGTH,
            description: "Folder name (max 80 characters).",
          },
          projectId: {
            type: "string",
            description: "Create a folder owned by this project. Mutually exclusive with spaceId.",
          },
          spaceId: {
            type: "string",
            description: "Create a folder owned by this space. Mutually exclusive with projectId.",
          },
          isPinned: { type: "boolean", description: "Pin the folder when creating it." },
        },
        required: ["name"],
        additionalProperties: false,
      },
      annotations: { title: "Create a Luminor folder", ...WRITE_TOOL_ANNOTATIONS },
    },
    handler: (args, context) =>
      Effect.gen(function* () {
        const name = readStringArg(args, "name", { required: true })!;
        if (name.length > FOLDER_NAME_MAX_LENGTH) {
          throw new ToolInputError(
            `Argument "name" must be at most ${String(FOLDER_NAME_MAX_LENGTH)} characters.`,
          );
        }
        const projectId = readStringArg(args, "projectId");
        const spaceId = readStringArg(args, "spaceId");
        const isPinned = readBooleanArg(args, "isPinned") ?? false;
        const caller = yield* requireThreadShell(context.callerThreadId);
        const owner = resolveCreateFolderOwner({
          projectId,
          spaceId,
          callerProjectId: caller.projectId,
        });
        const snapshot = yield* snapshotQuery
          .getShellSnapshot()
          .pipe(Effect.mapError((error) => new ToolInputError(errorText(error))));
        if (owner.kind === "project") {
          const project = yield* requireProject(owner.projectId);
          if (
            !isOrdinaryProjectRow({
              projectKind: project.kind,
              projectTitle: project.title,
              projectWorkspaceRoot: project.workspaceRoot,
              workspacePaths,
            })
          ) {
            throw new ToolInputError(
              "Folders can only be created under an active project or space.",
            );
          }
        } else {
          const space = snapshot.spaces.find((entry) => entry.id === owner.spaceId);
          if (!space) {
            throw new ToolInputError(`Space "${owner.spaceId}" was not found.`);
          }
        }
        const existing = snapshot.folders.find(
          (folder) =>
            folderOwnersEqual(folder.owner, owner) &&
            folderNameKey(folder.name) === folderNameKey(name),
        );
        if (existing) {
          return mcpToolResultJson({ ...summarizeFolder(existing), created: false });
        }
        const folderId = FolderId.makeUnsafe(randomUUID());
        const sortOrder = snapshot.folders
          .filter((folder) => folderOwnersEqual(folder.owner, owner))
          .reduce((maximum, folder) => Math.max(maximum, folder.sortOrder + 1), 0);
        yield* orchestrationEngine
          .dispatch({
            type: "folder.create",
            commandId: CommandId.makeUnsafe(`agent:${randomUUID()}:folder-create`),
            folderId,
            owner,
            name,
            isPinned,
            createdAt: gatewayIsoNow(),
          })
          .pipe(Effect.mapError((error) => new ToolInputError(errorText(error))));
        return mcpToolResultJson({
          folderId,
          name,
          owner,
          isPinned,
          sortOrder,
          created: true,
        });
      }).pipe(Effect.catch((error) => Effect.succeed(mcpToolResultError(errorText(error))))),
  };

  const setThreadFolder: ToolEntry = {
    requiredCapability: "thread:write",
    requiresActiveTurn: true,
    definition: {
      name: "luminor_set_thread_folder",
      description:
        "Move a Luminor thread into a folder, or pass folderId null to unfile it. The folder must belong to the thread's project or to the space that project is assigned to.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "Thread to file or unfile." },
          folderId: {
            type: ["string", "null"],
            description: "Destination folder, or null to remove the thread from its folder.",
          },
        },
        required: ["threadId", "folderId"],
        additionalProperties: false,
      },
      annotations: { title: "Move a Luminor thread into a folder", ...WRITE_TOOL_ANNOTATIONS },
    },
    handler: (args, context) =>
      Effect.gen(function* () {
        const threadId = readStringArg(args, "threadId", { required: true })!;
        const folderIdRaw = args.folderId;
        if (
          folderIdRaw !== null &&
          (typeof folderIdRaw !== "string" || folderIdRaw.trim() === "")
        ) {
          throw new ToolInputError('Argument "folderId" must be a folder id or null.');
        }
        const requestedFolderId = folderIdRaw === null ? null : folderIdRaw.trim();
        const caller = yield* requireThreadShell(context.callerThreadId);
        const target = yield* requireThreadShell(threadId);
        yield* assertCallerMayDriveThread(caller, target);
        let folderId: FolderId | null = null;
        if (requestedFolderId !== null) {
          const [snapshot, project] = yield* Effect.all([
            snapshotQuery
              .getShellSnapshot()
              .pipe(Effect.mapError((error) => new ToolInputError(errorText(error)))),
            requireProject(target.projectId),
          ]);
          folderId = resolveGatewayFolderPlacement({
            folderId: requestedFolderId,
            folders: snapshot.folders,
            project,
          });
        }
        yield* orchestrationEngine
          .dispatch({
            type: "thread.meta.update",
            commandId: CommandId.makeUnsafe(`agent:${randomUUID()}:folder-move`),
            threadId: ThreadId.makeUnsafe(target.id),
            folderId,
          })
          .pipe(Effect.mapError((error) => new ToolInputError(errorText(error))));
        return mcpToolResultJson({ threadId: target.id, folderId });
      }).pipe(Effect.catch((error) => Effect.succeed(mcpToolResultError(errorText(error))))),
  };

  return [listSpaces, listFolders, createFolder, setThreadFolder];
}

export function resolveGatewayFolderPlacement(input: {
  readonly folderId: string;
  readonly folders: ReadonlyArray<OrchestrationFolderShell>;
  readonly project: OrchestrationProjectShell;
}): FolderId {
  const folder = input.folders.find((entry) => entry.id === input.folderId);
  if (!folder) {
    throw new ToolInputError(`Folder "${input.folderId}" was not found.`);
  }
  requireFolderAcceptsProjectFromSnapshot({ folder, project: input.project });
  return folder.id;
}
