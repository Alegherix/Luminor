import http from "node:http";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import {
  FolderId,
  ProjectId,
  type OrchestrationCommand,
  type OrchestrationFolder,
  type OrchestrationProject,
  type OrchestrationReadModel,
} from "@luminor/contracts";
import { Effect, Exit, Layer, Scope } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { AuthError } from "../auth/Services/ServerAuth";
import { resolveDefaultChatWorkspaceRoot, ServerConfig, type ServerConfigShape } from "../config";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../orchestration/Services/OrchestrationEngine";
import {
  handleInboundNewChat,
  INBOUND_NEW_CHAT_MODEL_SELECTION,
  INBOUND_NEW_CHAT_ROUTE_PATH,
  makeInboundNewChatEffectRouteLayer,
} from "./newChat";

const NOW = "2026-08-18T10:00:00.000Z";
const CHAT_PROJECT_ID = ProjectId.makeUnsafe("project-chats");
const ORDINARY_PROJECT_ID = ProjectId.makeUnsafe("project-app");
const LEGACY_HOME_PROJECT_ID = ProjectId.makeUnsafe("project-home");
const CRASHES_FOLDER_ID = FolderId.makeUnsafe("folder-crashes");

function makeProject(
  overrides: Partial<OrchestrationProject> & Pick<OrchestrationProject, "id" | "title" | "kind">,
): OrchestrationProject {
  return {
    workspaceRoot: `/tmp/${overrides.id}`,
    defaultModelSelection: null,
    scripts: [],
    isPinned: false,
    spaceId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeFolder(
  overrides: Partial<OrchestrationFolder> & Pick<OrchestrationFolder, "id" | "name" | "owner">,
): OrchestrationFolder {
  return {
    sortOrder: 0,
    isPinned: false,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeReadModel(overrides: Partial<OrchestrationReadModel> = {}): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    spaces: [],
    folders: [],
    projects: [],
    threads: [],
    updatedAt: NOW,
    ...overrides,
  };
}

function workspacePaths(): Pick<ServerConfigShape, "homeDir" | "chatWorkspaceRoot"> {
  return {
    homeDir: "/Users/demo",
    chatWorkspaceRoot: resolveDefaultChatWorkspaceRoot({ homeDir: "/Users/demo" }),
  };
}

function succeedDispatch(commands: OrchestrationCommand[]) {
  return (command: OrchestrationCommand) =>
    Effect.sync(() => {
      commands.push(command);
      return { sequence: commands.length };
    });
}

describe("handleInboundNewChat", () => {
  it("creates Crashes once and reuses that folder on a second call", async () => {
    const chatProject = makeProject({
      id: CHAT_PROJECT_ID,
      kind: "chat",
      title: "Chats",
    });
    const firstCommands: OrchestrationCommand[] = [];
    await Effect.runPromise(
      handleInboundNewChat({
        body: {
          title: "Process crashed: node",
          prompt: "Diagnose this crash.",
          folderName: "Crashes",
          submit: false,
        },
        readModel: makeReadModel({ projects: [chatProject] }),
        workspacePaths: workspacePaths(),
        dispatch: succeedDispatch(firstCommands),
      }),
    );

    const folderCreates = firstCommands.filter((command) => command.type === "folder.create");
    expect(folderCreates).toHaveLength(1);
    expect(folderCreates[0]).toMatchObject({
      type: "folder.create",
      name: "Crashes",
      isPinned: false,
      owner: { kind: "project", projectId: CHAT_PROJECT_ID },
    });
    const createdFolderId =
      folderCreates[0]?.type === "folder.create" ? folderCreates[0].folderId : undefined;
    expect(createdFolderId).toBeDefined();
    expect(firstCommands.find((command) => command.type === "thread.create")).toMatchObject({
      folderId: createdFolderId,
      projectId: CHAT_PROJECT_ID,
    });

    const secondCommands: OrchestrationCommand[] = [];
    await Effect.runPromise(
      handleInboundNewChat({
        body: {
          title: "Process crashed: bun",
          prompt: "Diagnose another crash.",
          folderName: "Crashes",
          submit: false,
        },
        readModel: makeReadModel({
          projects: [chatProject],
          folders: [
            makeFolder({
              id: CRASHES_FOLDER_ID,
              name: "Crashes",
              owner: { kind: "project", projectId: CHAT_PROJECT_ID },
            }),
          ],
        }),
        workspacePaths: workspacePaths(),
        dispatch: succeedDispatch(secondCommands),
      }),
    );

    expect(secondCommands.filter((command) => command.type === "folder.create")).toEqual([]);
    expect(secondCommands.find((command) => command.type === "thread.create")).toMatchObject({
      folderId: CRASHES_FOLDER_ID,
      projectId: CHAT_PROJECT_ID,
    });
  });

  it("uses the chat container, not an ordinary project", async () => {
    const commands: OrchestrationCommand[] = [];
    await Effect.runPromise(
      handleInboundNewChat({
        body: {
          title: "Crash",
          prompt: "Look at this.",
          submit: false,
        },
        readModel: makeReadModel({
          projects: [
            makeProject({
              id: ORDINARY_PROJECT_ID,
              kind: "project",
              title: "App",
              workspaceRoot: "/tmp/app",
            }),
            makeProject({
              id: CHAT_PROJECT_ID,
              kind: "chat",
              title: "Chats",
            }),
          ],
        }),
        workspacePaths: workspacePaths(),
        dispatch: succeedDispatch(commands),
      }),
    );

    const threadCreate = commands.find((command) => command.type === "thread.create");
    expect(threadCreate).toMatchObject({
      type: "thread.create",
      projectId: CHAT_PROJECT_ID,
      title: "Crash",
      modelSelection: INBOUND_NEW_CHAT_MODEL_SELECTION,
      runtimeMode: "full-access",
      interactionMode: "default",
      envMode: "local",
    });
    expect(threadCreate?.type).toBe("thread.create");
    if (threadCreate?.type === "thread.create") {
      expect(threadCreate).not.toHaveProperty("workingDirectory");
      expect(threadCreate).not.toHaveProperty("creationSource");
    }
  });

  it("starts a turn only when submit is true", async () => {
    const chatProject = makeProject({
      id: CHAT_PROJECT_ID,
      kind: "chat",
      title: "Chats",
    });
    const withoutSubmit: OrchestrationCommand[] = [];
    await Effect.runPromise(
      handleInboundNewChat({
        body: {
          title: "Draft",
          prompt: "Do not start yet.",
          submit: false,
        },
        readModel: makeReadModel({ projects: [chatProject] }),
        workspacePaths: workspacePaths(),
        dispatch: succeedDispatch(withoutSubmit),
      }),
    );
    expect(withoutSubmit.some((command) => command.type === "thread.turn.start")).toBe(false);

    const withSubmit: OrchestrationCommand[] = [];
    await Effect.runPromise(
      handleInboundNewChat({
        body: {
          title: "Go",
          prompt: "Diagnose this crash.",
          submit: true,
        },
        readModel: makeReadModel({ projects: [chatProject] }),
        workspacePaths: workspacePaths(),
        dispatch: succeedDispatch(withSubmit),
      }),
    );
    const turnStart = withSubmit.find((command) => command.type === "thread.turn.start");
    const threadCreate = withSubmit.find((command) => command.type === "thread.create");
    expect(turnStart).toMatchObject({
      type: "thread.turn.start",
      message: {
        role: "user",
        text: "Diagnose this crash.",
        attachments: [],
      },
    });
    if (turnStart?.type === "thread.turn.start" && threadCreate?.type === "thread.create") {
      expect(turnStart.threadId).toBe(threadCreate.threadId);
    }
  });

  it("returns threadId when turn start fails after create", async () => {
    const commands: OrchestrationCommand[] = [];
    const result = await Effect.runPromise(
      handleInboundNewChat({
        body: {
          title: "Crash",
          prompt: "Start me.",
          submit: true,
        },
        readModel: makeReadModel({
          projects: [
            makeProject({
              id: CHAT_PROJECT_ID,
              kind: "chat",
              title: "Chats",
            }),
          ],
        }),
        workspacePaths: workspacePaths(),
        dispatch: (command) => {
          commands.push(command);
          if (command.type === "thread.turn.start") {
            return Effect.fail(new Error("provider unavailable"));
          }
          return Effect.succeed({ sequence: commands.length });
        },
      }),
    );

    expect(commands.some((command) => command.type === "thread.create")).toBe(true);
    expect(commands.some((command) => command.type === "thread.turn.start")).toBe(true);
    expect(result.threadId).toEqual(expect.any(String));
    const threadCreate = commands.find((command) => command.type === "thread.create");
    if (threadCreate?.type === "thread.create") {
      expect(result.threadId).toBe(threadCreate.threadId);
    }
  });

  it("fails when no chats container exists", async () => {
    await expect(
      Effect.runPromise(
        handleInboundNewChat({
          body: { title: "Crash", prompt: "Hello", submit: false },
          readModel: makeReadModel({
            projects: [
              makeProject({
                id: ORDINARY_PROJECT_ID,
                kind: "project",
                title: "App",
                workspaceRoot: "/tmp/app",
              }),
            ],
          }),
          workspacePaths: workspacePaths(),
          dispatch: () => Effect.succeed({ sequence: 1 }),
        }),
      ),
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringMatching(/chats container/i),
    });
  });

  it("falls back to the legacy Home chat container", async () => {
    const commands: OrchestrationCommand[] = [];
    await Effect.runPromise(
      handleInboundNewChat({
        body: { title: "Legacy", prompt: "Hello", submit: false },
        readModel: makeReadModel({
          projects: [
            makeProject({
              id: ORDINARY_PROJECT_ID,
              kind: "project",
              title: "App",
              workspaceRoot: "/tmp/app",
            }),
            makeProject({
              id: LEGACY_HOME_PROJECT_ID,
              kind: "project",
              title: "Home",
              workspaceRoot: "/Users/demo",
            }),
          ],
        }),
        workspacePaths: workspacePaths(),
        dispatch: succeedDispatch(commands),
      }),
    );

    expect(commands.find((command) => command.type === "thread.create")).toMatchObject({
      projectId: LEGACY_HOME_PROJECT_ID,
    });
  });
});

describe("POST /internal/inbound/new-chat", () => {
  it("rejects unauthenticated requests", async () => {
    await withInboundServer(async (origin) => {
      const response = await fetch(`${origin}${INBOUND_NEW_CHAT_ROUTE_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Crash",
          prompt: "Diagnose this crash.",
          folderName: "Crashes",
          submit: true,
        }),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Authentication required." });
    });
  });
});

async function withInboundServer(run: (origin: string) => Promise<void>): Promise<void> {
  const scope = await Effect.runPromise(Scope.make("sequential"));
  let nodeServer: http.Server | null = null;
  try {
    await Effect.runPromise(
      Scope.provide(
        Effect.gen(function* () {
          const httpServer = yield* NodeHttpServer.make(
            () => {
              nodeServer = http.createServer();
              return nodeServer;
            },
            { port: 0, host: "127.0.0.1" },
          );
          yield* httpServer.serve(
            yield* HttpRouter.toHttpEffect(
              makeInboundNewChatEffectRouteLayer(
                Effect.fail(new AuthError({ message: "Authentication required.", status: 401 })),
              ),
            ),
          );
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(ServerConfig, {
                mode: "desktop",
                port: 0,
                host: "127.0.0.1",
                cwd: "/tmp",
                homeDir: "/Users/demo",
                chatWorkspaceRoot: resolveDefaultChatWorkspaceRoot({ homeDir: "/Users/demo" }),
                attachmentsDir: "/tmp/luminor-inbound/attachments",
              } as ServerConfigShape),
              Layer.succeed(OrchestrationEngineService, {} as OrchestrationEngineShape),
              NodeHttpServer.layerHttpServices,
            ),
          ),
        ),
        scope,
      ),
    );
    const address = (nodeServer as http.Server | null)?.address();
    if (!address || typeof address !== "object") throw new Error("Expected server address");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
}
