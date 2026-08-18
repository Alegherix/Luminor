import { randomUUID } from "node:crypto";

import {
  CommandId,
  FOLDER_NAME_MAX_LENGTH,
  FolderId,
  MessageId,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  ThreadId,
  type GrokModelSelection,
  type OrchestrationCommand,
  type OrchestrationProject,
  type OrchestrationReadModel,
} from "@luminor/contracts";
import { folderOwnersEqual, projectFolderOwner } from "@luminor/shared/folderOwnership";
import { isLegacyHomeChatContainerRow } from "@luminor/shared/projectContainers";
import { Effect, FileSystem, Path, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { authErrorResponse } from "../auth/effectHttp";
import { AuthError } from "../auth/Services/ServerAuth";
import { ServerConfig } from "../config";
import { makeDispatchCommandNormalizer } from "../orchestration/dispatchCommandNormalization";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine";

export const INBOUND_NEW_CHAT_ROUTE_PATH = "/internal/inbound/new-chat";

export const INBOUND_NEW_CHAT_MODEL_SELECTION = {
  provider: "grok",
  model: "grok-4.6",
  options: { reasoningEffort: "high" },
} as const satisfies GrokModelSelection;

const INBOUND_JSON_BODY_MAX_BYTES = PROVIDER_SEND_TURN_MAX_INPUT_CHARS + 16 * 1024;
const DEFAULT_INBOUND_THREAD_TITLE = "New chat";
const INBOUND_THREAD_TITLE_MAX_LENGTH = 80;

const InboundNewChatBody = Schema.Struct({
  title: Schema.optional(Schema.String),
  prompt: Schema.String,
  folderName: Schema.optional(Schema.String),
  submit: Schema.Boolean,
});
const decodeInboundNewChatBody = Schema.decodeUnknownEffect(InboundNewChatBody);

export interface InboundNewChatRequest {
  readonly title?: string;
  readonly prompt: string;
  readonly folderName?: string;
  readonly submit: boolean;
}

export interface InboundNewChatWorkspacePaths {
  readonly homeDir: string | null | undefined;
  readonly chatWorkspaceRoot?: string | null | undefined;
}

export class InboundNewChatError {
  readonly _tag = "InboundNewChatError";
  constructor(
    readonly message: string,
    readonly status: number,
  ) {}
}

export function handleInboundNewChat(input: {
  readonly body: InboundNewChatRequest;
  readonly readModel: OrchestrationReadModel;
  readonly workspacePaths: InboundNewChatWorkspacePaths;
  readonly dispatch: (
    command: OrchestrationCommand,
  ) => Effect.Effect<{ readonly sequence: number }, unknown>;
}): Effect.Effect<{ readonly threadId: string }, InboundNewChatError> {
  return Effect.gen(function* () {
    const prompt = input.body.prompt.trim();
    if (prompt.length === 0) {
      return yield* Effect.fail(new InboundNewChatError("Prompt is required.", 400));
    }
    if (prompt.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS) {
      return yield* Effect.fail(new InboundNewChatError("Prompt is too long.", 400));
    }

    const container = resolveChatContainer(input.readModel, input.workspacePaths);
    if (!container) {
      return yield* Effect.fail(new InboundNewChatError("Chats container was not found.", 404));
    }

    const folderName = input.body.folderName?.trim() ?? "";
    let folderId: FolderId | null = null;
    if (folderName.length > 0) {
      if (folderName.length > FOLDER_NAME_MAX_LENGTH) {
        return yield* Effect.fail(new InboundNewChatError("Folder name is too long.", 400));
      }
      folderId = yield* resolveOrCreateFolder({
        folderName,
        projectId: container.id,
        readModel: input.readModel,
        dispatch: input.dispatch,
      });
    }

    const threadId = ThreadId.makeUnsafe(randomUUID());
    const createdAt = new Date().toISOString();
    yield* input
      .dispatch({
        type: "thread.create",
        commandId: CommandId.makeUnsafe(`inbound:${randomUUID()}:thread-create`),
        threadId,
        projectId: container.id,
        folderId,
        title: inboundThreadTitle(input.body.title, prompt),
        modelSelection: INBOUND_NEW_CHAT_MODEL_SELECTION,
        runtimeMode: "full-access",
        interactionMode: "default",
        envMode: "local",
        branch: null,
        worktreePath: null,
        createdAt,
      })
      .pipe(Effect.mapError((cause) => toDispatchError("Failed to create inbound thread.", cause)));

    if (input.body.submit) {
      yield* input
        .dispatch({
          type: "thread.turn.start",
          commandId: CommandId.makeUnsafe(`inbound:${randomUUID()}:turn-start`),
          threadId,
          message: {
            messageId: MessageId.makeUnsafe(randomUUID()),
            role: "user",
            text: prompt,
            attachments: [],
          },
          modelSelection: INBOUND_NEW_CHAT_MODEL_SELECTION,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: new Date().toISOString(),
        })
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("inbound new-chat turn start failed", {
              threadId,
              error: errorMessage(error),
            }),
          ),
        );
    }

    return { threadId };
  });
}

export function makeInboundNewChatEffectRouteLayer<R>(
  authenticate: Effect.Effect<
    unknown,
    AuthError | { readonly message: string; readonly status: number },
    R
  >,
) {
  return HttpRouter.add(
    "POST",
    INBOUND_NEW_CHAT_ROUTE_PATH,
    Effect.gen(function* () {
      yield* authenticate;
      const request = yield* HttpServerRequest.HttpServerRequest;
      const payload = yield* request.json.pipe(
        Effect.provideService(
          HttpServerRequest.MaxBodySize,
          FileSystem.Size(INBOUND_JSON_BODY_MAX_BYTES),
        ),
        Effect.mapError(() => new InboundNewChatError("Invalid inbound new-chat payload.", 400)),
      );
      const decoded = yield* decodeInboundNewChatBody(payload).pipe(
        Effect.mapError(() => new InboundNewChatError("Invalid inbound new-chat payload.", 400)),
      );
      const engine = yield* OrchestrationEngineService;
      const config = yield* ServerConfig;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const normalize = makeDispatchCommandNormalizer({
        attachmentsDir: config.attachmentsDir,
        chatWorkspaceRoot: config.chatWorkspaceRoot,
        studioWorkspaceRoot: config.studioWorkspaceRoot,
        fileSystem,
        path,
        canonicalizeProjectWorkspaceRoot: (workspaceRoot) => Effect.succeed(workspaceRoot),
      });
      const readModel = yield* engine.getReadModel();
      return HttpServerResponse.jsonUnsafe(
        yield* handleInboundNewChat({
          body: decoded,
          readModel,
          workspacePaths: {
            homeDir: config.homeDir,
            chatWorkspaceRoot: config.chatWorkspaceRoot,
          },
          dispatch: (command) =>
            Effect.gen(function* () {
              const { command: normalizedCommand, prepareWorkspaceRoot } = yield* normalize({
                command,
              });
              const result = yield* engine.dispatch(normalizedCommand);
              if (prepareWorkspaceRoot) {
                yield* prepareWorkspaceRoot;
              }
              return result;
            }).pipe(
              Effect.mapError((cause) =>
                toDispatchError("Failed to dispatch inbound new-chat command.", cause),
              ),
            ),
        }),
        { status: 200 },
      );
    }).pipe(
      Effect.catchTag("AuthError", (error) => Effect.succeed(authErrorResponse(error))),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: errorMessage(error) },
            { status: statusFromError(error) },
          ),
        ),
      ),
    ),
  );
}

function resolveChatContainer(
  readModel: OrchestrationReadModel,
  workspacePaths: InboundNewChatWorkspacePaths,
): OrchestrationProject | null {
  const activeProjects = readModel.projects.filter((project) => project.deletedAt === null);
  return (
    activeProjects.find((project) => project.kind === "chat") ??
    activeProjects.find((project) =>
      isLegacyHomeChatContainerRow({
        projectTitle: project.title,
        projectWorkspaceRoot: project.workspaceRoot,
        paths: workspacePaths,
      }),
    ) ??
    null
  );
}

function resolveOrCreateFolder(input: {
  readonly folderName: string;
  readonly projectId: OrchestrationProject["id"];
  readonly readModel: OrchestrationReadModel;
  readonly dispatch: (
    command: OrchestrationCommand,
  ) => Effect.Effect<{ readonly sequence: number }, unknown>;
}): Effect.Effect<FolderId, InboundNewChatError> {
  const owner = projectFolderOwner(input.projectId);
  const existing = input.readModel.folders.find(
    (folder) =>
      folder.deletedAt === null &&
      folder.name === input.folderName &&
      folderOwnersEqual(folder.owner, owner),
  );
  if (existing) {
    return Effect.succeed(existing.id);
  }

  const folderId = FolderId.makeUnsafe(randomUUID());
  return input
    .dispatch({
      type: "folder.create",
      commandId: CommandId.makeUnsafe(`inbound:${randomUUID()}:folder-create`),
      folderId,
      owner,
      name: input.folderName,
      isPinned: false,
      createdAt: new Date().toISOString(),
    })
    .pipe(
      Effect.mapError((cause) => toDispatchError("Failed to create inbound folder.", cause)),
      Effect.as(folderId),
    );
}

function inboundThreadTitle(title: string | undefined, prompt: string): string {
  const explicit = title?.trim() ?? "";
  if (explicit.length > 0) {
    return explicit.slice(0, INBOUND_THREAD_TITLE_MAX_LENGTH);
  }
  const firstLine =
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? DEFAULT_INBOUND_THREAD_TITLE;
  return firstLine.slice(0, INBOUND_THREAD_TITLE_MAX_LENGTH);
}

function toDispatchError(fallback: string, cause: unknown): InboundNewChatError {
  return new InboundNewChatError(errorMessage(cause) || fallback, 500);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { readonly message?: unknown }).message ?? error);
  }
  return String(error);
}

function statusFromError(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { readonly status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return status;
    }
  }
  return 500;
}
