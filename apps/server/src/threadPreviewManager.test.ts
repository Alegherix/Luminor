import {
  PREVIEW_TERMINAL_ID,
  ProjectId,
  ThreadId,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
  type ProjectScript,
  type TerminalCloseInput,
  type TerminalEvent,
  type TerminalOpenInput,
  type TerminalSessionSnapshot,
  type TerminalWriteInput,
} from "@luminor/contracts";
import { NetService, type NetServiceShape } from "@luminor/shared/Net";
import { Effect, Fiber, Layer, Option, Stream } from "effect";
import { describe, expect, it, vi } from "vitest";

import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery";
import { TerminalError, TerminalManager } from "./terminal/Services/Manager";
import type { TerminalManagerShape } from "./terminal/Services/Manager";
import {
  PREVIEW_REQUIRES_SCRIPT_MESSAGE,
  PREVIEW_WORKTREE_PENDING_MESSAGE,
} from "./preview/previewLaunchPlan";
import { ThreadPreviewManager, ThreadPreviewManagerLive } from "./threadPreviewManager";
import type { ThreadPreviewManagerShape } from "./threadPreviewManager";

const THREAD_ID = "thread-1";
const WORKSPACE_ROOT = "/repo";
const WORKTREE_PATH = "/repo/.worktrees/thread-1";

const previewScript = (overrides: Partial<ProjectScript> = {}): ProjectScript =>
  ({
    id: "dev",
    name: "Dev server",
    command: "bun run dev",
    icon: "play",
    kind: "preview",
    urlTemplate: "http://localhost:5173",
    ...overrides,
  }) as ProjectScript;

interface TerminalStub {
  readonly layer: Layer.Layer<TerminalManager>;
  readonly opens: TerminalOpenInput[];
  readonly writes: TerminalWriteInput[];
  readonly closes: TerminalCloseInput[];
  readonly emit: (event: TerminalEvent) => void;
}

const makeTerminalStub = (
  options: {
    readonly beforeOpen?: (input: TerminalOpenInput, openCount: number) => Promise<void> | void;
    readonly failOpenCount?: number;
  } = {},
): TerminalStub => {
  const opens: TerminalOpenInput[] = [];
  const writes: TerminalWriteInput[] = [];
  const closes: TerminalCloseInput[] = [];
  const listeners = new Set<(event: TerminalEvent) => void>();

  const snapshot = (input: TerminalOpenInput): TerminalSessionSnapshot => ({
    threadId: input.threadId,
    terminalId: input.terminalId ?? PREVIEW_TERMINAL_ID,
    cwd: input.cwd,
    status: "running",
    pid: 4242,
    history: "",
    exitCode: null,
    exitSignal: null,
    updatedAt: "2026-08-10T00:00:00.000Z",
  });

  let remainingOpenFailures = options.failOpenCount ?? 0;
  const shape = {
    open: (input: TerminalOpenInput) =>
      Effect.gen(function* () {
        opens.push(input);
        if (options.beforeOpen) {
          yield* Effect.promise(() => Promise.resolve(options.beforeOpen?.(input, opens.length)));
        }
        if (remainingOpenFailures > 0) {
          remainingOpenFailures -= 1;
          return yield* Effect.fail(
            new TerminalError({ message: "Preview terminal failed to open." }),
          );
        }
        return snapshot(input);
      }),
    write: (input: TerminalWriteInput) =>
      Effect.sync(() => {
        writes.push(input);
      }),
    close: (input: TerminalCloseInput) =>
      Effect.sync(() => {
        closes.push(input);
      }),
    subscribe: (listener: (event: TerminalEvent) => void) =>
      Effect.sync(() => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
  } as unknown as TerminalManagerShape;

  return {
    layer: Layer.succeed(TerminalManager, shape),
    opens,
    writes,
    closes,
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
  };
};

interface NetStub {
  readonly layer: Layer.Layer<NetService>;
  readonly checkedPorts: number[];
}

const makeNetStub = (): NetStub => {
  const checkedPorts: number[] = [];
  const shape = {
    canListenOnHost: () => Effect.succeed(true),
    isPortAvailableOnLoopback: (port: number) =>
      Effect.sync(() => {
        checkedPorts.push(port);
        return true;
      }),
    reserveLoopbackPort: () => Effect.succeed(49_152),
    findAvailablePort: (preferred: number) => Effect.succeed(preferred),
  } satisfies NetServiceShape;
  return {
    layer: Layer.succeed(NetService, shape),
    checkedPorts,
  };
};

const makeProjectionStub = (input: {
  worktreePath?: string | null;
  envMode?: "local" | "worktree";
  scripts?: ReadonlyArray<ProjectScript>;
}): Layer.Layer<ProjectionSnapshotQuery> =>
  Layer.succeed(ProjectionSnapshotQuery, {
    getThreadShellById: (threadId: ThreadId) =>
      Effect.succeed(
        Option.some({
          id: threadId,
          projectId: ProjectId.makeUnsafe("project-1"),
          worktreePath: input.worktreePath === undefined ? WORKTREE_PATH : input.worktreePath,
          envMode: input.envMode ?? "worktree",
        } as unknown as OrchestrationThreadShell),
      ),
    getProjectShellById: () =>
      Effect.succeed(
        Option.some({
          id: ProjectId.makeUnsafe("project-1"),
          workspaceRoot: WORKSPACE_ROOT,
          scripts: input.scripts ?? [previewScript()],
        } as unknown as OrchestrationProjectShell),
      ),
  } as unknown as ProjectionSnapshotQueryShape);

const runPreview = <A, E>(
  stubs: {
    terminal: TerminalStub;
    projection: Layer.Layer<ProjectionSnapshotQuery>;
    net?: NetStub;
  },
  body: (manager: ThreadPreviewManagerShape) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const manager = yield* ThreadPreviewManager;
      return yield* body(manager);
    }).pipe(
      Effect.provide(
        ThreadPreviewManagerLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              stubs.terminal.layer,
              stubs.projection,
              (stubs.net ?? makeNetStub()).layer,
            ),
          ),
        ),
      ),
    ),
  );

describe("ThreadPreviewManager", () => {
  it("starts the project preview script in the thread worktree and reports running", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({});

    const { started, listed } = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        const started = yield* manager.start({ threadId: THREAD_ID });
        const listed = yield* manager.list;
        return { started, listed };
      }),
    );

    expect(started.preview.status).toBe("running");
    expect(started.preview.url).toBe("http://localhost:5173");
    expect(started.preview.terminalId).toBe(PREVIEW_TERMINAL_ID);
    expect(started.preview.command).toBe("bun run dev");
    expect(started.preview.cwd).toBe(WORKTREE_PATH);
    expect(listed.previews).toHaveLength(1);

    expect(terminal.opens).toHaveLength(1);
    expect(terminal.opens[0]).toMatchObject({
      threadId: THREAD_ID,
      terminalId: PREVIEW_TERMINAL_ID,
      cwd: WORKTREE_PATH,
      env: {
        LUMINOR_PROJECT_ROOT: WORKSPACE_ROOT,
        LUMINOR_WORKTREE_PATH: WORKTREE_PATH,
      },
    });
    expect(terminal.writes[0]?.data).toBe("bun run dev\r");
  });

  it("publishes every transition on its own event stream", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({});

    const statuses = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        const seen: string[] = [];
        const collector = yield* Effect.forkChild(
          Stream.runForEach(manager.stream, (event) =>
            Effect.sync(() => {
              if (event.type === "status") seen.push(event.preview.status);
            }),
          ),
        );
        yield* Effect.sleep(20);
        yield* manager.start({ threadId: THREAD_ID });
        yield* manager.stopPreview(THREAD_ID);
        yield* Effect.sleep(20);
        yield* Fiber.interrupt(collector);
        return seen;
      }),
    );

    expect(statuses).toEqual(["starting", "running", "idle"]);
  });

  it("treats a second start as a no-op while the preview is active", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({});

    const second = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        yield* manager.start({ threadId: THREAD_ID });
        return yield* manager.start({ threadId: THREAD_ID });
      }),
    );

    expect(second.preview.status).toBe("running");
    expect(terminal.opens).toHaveLength(1);
    expect(terminal.writes).toHaveLength(1);
  });

  it("marks a preview failed with the last output line when its process dies", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({});

    const listed = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        yield* manager.start({ threadId: THREAD_ID });
        terminal.emit({
          type: "output",
          threadId: THREAD_ID,
          terminalId: PREVIEW_TERMINAL_ID,
          createdAt: "2026-08-10T00:00:01.000Z",
          data: "Error: port already in use\n",
          byteLength: 27,
        });
        terminal.emit({
          type: "exited",
          threadId: THREAD_ID,
          terminalId: PREVIEW_TERMINAL_ID,
          createdAt: "2026-08-10T00:00:02.000Z",
          exitCode: 1,
          exitSignal: null,
        });
        yield* Effect.sleep(10);
        return yield* manager.list;
      }),
    );

    expect(listed.previews[0]?.status).toBe("failed");
    expect(listed.previews[0]?.message).toBe("Error: port already in use");
    expect(listed.previews[0]?.url).toBeNull();
  });

  it("stops a running preview through the single stop entry point", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({});

    const { stopped, listed } = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        yield* manager.start({ threadId: THREAD_ID });
        const stopped = yield* manager.stopPreview(THREAD_ID);
        const listed = yield* manager.list;
        return { stopped, listed };
      }),
    );

    expect(stopped.stopped).toBe(true);
    expect(listed.previews).toHaveLength(0);
    expect(terminal.closes.at(-1)).toMatchObject({
      threadId: THREAD_ID,
      terminalId: PREVIEW_TERMINAL_ID,
      deleteHistory: true,
    });
  });

  it("stopping an untracked preview is a no-op", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({});

    const stopped = await runPreview({ terminal, projection }, (manager) =>
      manager.stopPreview(THREAD_ID),
    );

    expect(stopped.stopped).toBe(false);
    expect(terminal.closes).toHaveLength(0);
  });

  it("runs a local thread's preview in the project directory", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({ worktreePath: null, envMode: "local" });

    const started = await runPreview({ terminal, projection }, (manager) =>
      manager.start({ threadId: THREAD_ID }),
    );

    expect(started.preview.status).not.toBe("failed");
    expect(started.preview.cwd).toBe(WORKSPACE_ROOT);
    expect(terminal.opens).toHaveLength(1);
  });

  it("fails while a worktree-mode thread has no worktree yet", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({ worktreePath: null, envMode: "worktree" });

    const started = await runPreview({ terminal, projection }, (manager) =>
      manager.start({ threadId: THREAD_ID }),
    );

    expect(started.preview.status).toBe("failed");
    expect(started.preview.message).toBe(PREVIEW_WORKTREE_PENDING_MESSAGE);
    expect(terminal.opens).toHaveLength(0);
  });

  it("fails when the project has no preview script", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({
      scripts: [previewScript({ id: "test", kind: "manual" })],
    });

    const started = await runPreview({ terminal, projection }, (manager) =>
      manager.start({ threadId: THREAD_ID }),
    );

    expect(started.preview.status).toBe("failed");
    expect(started.preview.message).toBe(PREVIEW_REQUIRES_SCRIPT_MESSAGE);
    expect(terminal.opens).toHaveLength(0);
  });

  it("discovers a URL split across terminal output writes", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({ scripts: [previewScript({ urlTemplate: null })] });

    const result = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        const started = yield* manager.start({ threadId: THREAD_ID });
        terminal.emit({
          type: "output",
          threadId: THREAD_ID,
          terminalId: PREVIEW_TERMINAL_ID,
          createdAt: "2026-08-10T00:00:01.000Z",
          data: "  ➜  Local: http://local",
          byteLength: 25,
        });
        yield* Effect.sleep(10);
        const beforeMatch = yield* manager.list;
        terminal.emit({
          type: "output",
          threadId: THREAD_ID,
          terminalId: PREVIEW_TERMINAL_ID,
          createdAt: "2026-08-10T00:00:02.000Z",
          data: "host:5173/dashboard\n",
          byteLength: 20,
        });
        yield* Effect.sleep(10);
        const afterMatch = yield* manager.list;
        return { started, beforeMatch, afterMatch };
      }),
    );

    expect(result.started.preview.status).toBe("starting");
    expect(result.beforeMatch.previews[0]?.status).toBe("starting");
    expect(result.afterMatch.previews[0]?.status).toBe("running");
    expect(result.afterMatch.previews[0]?.url).toBe("http://localhost:5173/dashboard");
  });

  it("does not treat a URL in an error message as ready output", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({ scripts: [previewScript({ urlTemplate: null })] });

    const listed = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        yield* manager.start({ threadId: THREAD_ID });
        terminal.emit({
          type: "output",
          threadId: THREAD_ID,
          terminalId: PREVIEW_TERMINAL_ID,
          createdAt: "2026-08-10T00:00:01.000Z",
          data: "Error: connect ECONNREFUSED http://localhost:5173\n",
          byteLength: 51,
        });
        yield* Effect.sleep(10);
        const listed = yield* manager.list;
        yield* manager.stopPreview(THREAD_ID);
        return listed;
      }),
    );

    expect(listed.previews[0]?.status).toBe("starting");
    expect(listed.previews[0]?.url).toBeNull();
  });

  it("reports a live process as running without a URL after 90 seconds", async () => {
    vi.useFakeTimers();
    try {
      const terminal = makeTerminalStub();
      const projection = makeProjectionStub({ scripts: [previewScript({ urlTemplate: null })] });

      const listed = await runPreview({ terminal, projection }, (manager) =>
        Effect.gen(function* () {
          yield* manager.start({ threadId: THREAD_ID });
          vi.advanceTimersByTime(90_000);
          return yield* manager.list;
        }),
      );

      expect(listed.previews[0]?.status).toBe("running");
      expect(listed.previews[0]?.url).toBeNull();
      expect(terminal.closes).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists a manually entered URL for the current preview run", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({ scripts: [previewScript({ urlTemplate: null })] });

    const result = await runPreview({ terminal, projection }, (manager) =>
      Effect.gen(function* () {
        yield* manager.start({ threadId: THREAD_ID });
        const updated = yield* manager.setUrl({
          threadId: THREAD_ID,
          url: "0.0.0.0:4321/app",
        });
        const listed = yield* manager.list;
        return { updated, listed };
      }),
    );

    expect(result.updated.preview.status).toBe("running");
    expect(result.updated.preview.url).toBe("http://localhost:4321/app");
    expect(result.listed.previews[0]?.url).toBe("http://localhost:4321/app");
  });

  it("allocates distinct reserved ports for previews started concurrently", async () => {
    let releaseOpenGate!: () => void;
    const openGate = new Promise<void>((resolve) => {
      releaseOpenGate = resolve;
    });
    const terminal = makeTerminalStub({
      beforeOpen: async (_input, openCount) => {
        if (openCount === 2) releaseOpenGate();
        await openGate;
      },
    });
    const net = makeNetStub();
    const projection = makeProjectionStub({
      scripts: [previewScript({ urlTemplate: "http://localhost:{port}" })],
    });

    const started = await runPreview({ terminal, projection, net }, (manager) =>
      Effect.all(
        [manager.start({ threadId: "thread-a" }), manager.start({ threadId: "thread-b" })],
        { concurrency: "unbounded" },
      ),
    );

    const ports = terminal.opens.map((open) => open.env?.PORT);
    expect(new Set(ports).size).toBe(2);
    expect(terminal.opens[0]?.env).toMatchObject({
      PORT: ports[0],
      LUMINOR_PREVIEW_PORT: ports[0],
    });
    expect(terminal.opens[1]?.env).toMatchObject({
      PORT: ports[1],
      LUMINOR_PREVIEW_PORT: ports[1],
    });
    expect(started.map(({ preview }) => preview.url).toSorted()).toEqual(
      ports.map((port) => `http://localhost:${port}`).toSorted(),
    );
  });

  it("releases a failed spawn reservation and allocates a fresh port on retry", async () => {
    const terminal = makeTerminalStub({ failOpenCount: 1 });
    const net = makeNetStub();
    const projection = makeProjectionStub({
      scripts: [previewScript({ urlTemplate: "http://localhost:{port}" })],
    });

    const { first, second } = await runPreview({ terminal, projection, net }, (manager) =>
      Effect.gen(function* () {
        const first = yield* manager.start({ threadId: THREAD_ID });
        const second = yield* manager.start({ threadId: THREAD_ID });
        return { first, second };
      }),
    );

    expect(first.preview.status).toBe("failed");
    expect(second.preview.status).toBe("running");
    expect(second.preview.port).not.toBe(first.preview.port);
    expect(net.checkedPorts).toHaveLength(2);
  });

  it("does not check port availability for a fixed URL template", async () => {
    const terminal = makeTerminalStub();
    const net = makeNetStub();
    const projection = makeProjectionStub({});

    await runPreview({ terminal, projection, net }, (manager) =>
      manager.start({ threadId: THREAD_ID }),
    );

    expect(net.checkedPorts).toHaveLength(0);
    expect(terminal.opens[0]?.env?.PORT).toBeUndefined();
    expect(terminal.opens[0]?.env?.LUMINOR_PREVIEW_PORT).toBeUndefined();
  });
});
