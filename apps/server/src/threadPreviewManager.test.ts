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
import { Effect, Fiber, Layer, Option, Stream } from "effect";
import { describe, expect, it } from "vitest";

import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery";
import type { TerminalManagerShape } from "./terminal/Services/Manager";
import { TerminalManager } from "./terminal/Services/Manager";
import {
  PREVIEW_REQUIRES_SCRIPT_MESSAGE,
  PREVIEW_REQUIRES_WORKTREE_MESSAGE,
} from "./preview/previewLaunchPlan";
import type { ThreadPreviewManagerShape } from "./threadPreviewManager";
import { ThreadPreviewManager, ThreadPreviewManagerLive } from "./threadPreviewManager";

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

const makeTerminalStub = (): TerminalStub => {
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

  const shape = {
    open: (input: TerminalOpenInput) =>
      Effect.sync(() => {
        opens.push(input);
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

const makeProjectionStub = (input: {
  worktreePath?: string | null;
  scripts?: ReadonlyArray<ProjectScript>;
}): Layer.Layer<ProjectionSnapshotQuery> =>
  Layer.succeed(ProjectionSnapshotQuery, {
    getThreadShellById: () =>
      Effect.succeed(
        Option.some({
          id: ThreadId.makeUnsafe(THREAD_ID),
          projectId: ProjectId.makeUnsafe("project-1"),
          worktreePath: input.worktreePath === undefined ? WORKTREE_PATH : input.worktreePath,
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

const runPreview = <A>(
  stubs: { terminal: TerminalStub; projection: Layer.Layer<ProjectionSnapshotQuery> },
  body: (manager: ThreadPreviewManagerShape) => Effect.Effect<A>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const manager = yield* ThreadPreviewManager;
      return yield* body(manager);
    }).pipe(
      Effect.provide(
        ThreadPreviewManagerLive.pipe(
          Layer.provide(Layer.mergeAll(stubs.terminal.layer, stubs.projection)),
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

  it("fails without a worktree instead of spawning a process", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({ worktreePath: null });

    const started = await runPreview({ terminal, projection }, (manager) =>
      manager.start({ threadId: THREAD_ID }),
    );

    expect(started.preview.status).toBe("failed");
    expect(started.preview.message).toBe(PREVIEW_REQUIRES_WORKTREE_MESSAGE);
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

  it("resolves no url when the preview script has no url template", async () => {
    const terminal = makeTerminalStub();
    const projection = makeProjectionStub({ scripts: [previewScript({ urlTemplate: null })] });

    const started = await runPreview({ terminal, projection }, (manager) =>
      manager.start({ threadId: THREAD_ID }),
    );

    expect(started.preview.status).toBe("running");
    expect(started.preview.url).toBeNull();
  });
});
