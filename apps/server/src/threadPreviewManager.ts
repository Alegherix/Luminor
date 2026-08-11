/**
 * ThreadPreviewManager - Server-owned preview process orchestration.
 *
 * A thread's preview is a managed terminal under the reserved `preview` terminal
 * id, so it inherits PTY lifecycle, history and process-tree teardown from
 * TerminalManager. The manager owns the preview state machine
 * (idle → starting → running → failed), keeps it in memory only, and broadcasts
 * every transition over the `preview.status` push channel.
 *
 * `stopPreview` is the single stop entry point: RPC stop, worktree removal,
 * thread archive/delete and server shutdown all route through it.
 *
 * @module ThreadPreviewManager
 */
import {
  PREVIEW_TERMINAL_ID,
  ThreadId,
  type ThreadPreviewEvent,
  type ThreadPreviewListResult,
  type ThreadPreviewSetUrlInput,
  type ThreadPreviewSetUrlResult,
  type ThreadPreviewStartInput,
  type ThreadPreviewStartResult,
  type ThreadPreviewState,
  type ThreadPreviewStopResult,
} from "@luminor/contracts";
import { idleThreadPreview, isActiveThreadPreview } from "@luminor/shared/preview/previewState";
import { lastTerminalOutputLine } from "@luminor/shared/preview/previewOutput";
import { detectPreviewUrl } from "@luminor/shared/preview/urlDetection";
import { resolvePreviewUrl } from "@luminor/shared/preview/previewUrl";
import { Effect, Layer, Option, PubSub, Ref, ServiceMap, Stream } from "effect";

import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery";
import { TerminalManager } from "./terminal/Services/Manager";
import {
  buildPreviewLaunchPlan,
  type PreviewLaunchPlan,
  type PreviewLaunchResolution,
} from "./preview/previewLaunchPlan";

const PREVIEW_TERMINAL_COLS = 120;
const PREVIEW_TERMINAL_ROWS = 30;
const PREVIEW_URL_DETECTION_TIMEOUT_MS = 90_000;

const THREAD_MISSING_MESSAGE = "Thread is no longer available.";
const PROJECT_MISSING_MESSAGE = "Project is no longer available.";

function failedState(base: ThreadPreviewState, message: string): ThreadPreviewState {
  return { ...base, status: "failed", url: null, message };
}

// One preview run per thread. `runId` fences late transitions from a run that a
// stop or a restart already replaced.
interface PreviewRun {
  readonly runId: number;
  readonly state: ThreadPreviewState;
  readonly lastOutputLine: string | null;
  readonly outputTail: string;
  readonly urlDetectionTimeout: ReturnType<typeof setTimeout> | null;
}

export interface ThreadPreviewManagerShape {
  /** Start the thread's preview. Starting an active preview is a no-op. */
  readonly start: (input: ThreadPreviewStartInput) => Effect.Effect<ThreadPreviewStartResult>;
  /**
   * Single stop entry point for every trigger (explicit stop, worktree removal,
   * thread archive/delete, shutdown). Kills the whole preview process tree.
   * Stopping a thread without a tracked preview is a no-op.
   */
  readonly stopPreview: (threadId: string) => Effect.Effect<ThreadPreviewStopResult>;
  readonly setUrl: (
    input: ThreadPreviewSetUrlInput,
  ) => Effect.Effect<ThreadPreviewSetUrlResult, Error>;
  /** Snapshot of every tracked preview. */
  readonly list: Effect.Effect<ThreadPreviewListResult>;
  /** Live stream of preview transitions (excludes the initial snapshot). */
  readonly stream: Stream.Stream<ThreadPreviewEvent>;
}

export class ThreadPreviewManager extends ServiceMap.Service<
  ThreadPreviewManager,
  ThreadPreviewManagerShape
>()("luminor/threadPreviewManager") {}

export const ThreadPreviewManagerLive = Layer.effect(
  ThreadPreviewManager,
  Effect.gen(function* () {
    const projection = yield* ProjectionSnapshotQuery;
    const terminalManager = yield* TerminalManager;
    const pubsub = yield* Effect.acquireRelease(
      PubSub.unbounded<ThreadPreviewEvent>(),
      PubSub.shutdown,
    );
    const runs = yield* Ref.make<Record<string, PreviewRun>>({});
    const nextRunId = yield* Ref.make(0);

    const publish = (preview: ThreadPreviewState) =>
      PubSub.publish(pubsub, { type: "status", preview });

    // Applies a transition only while `runId` still owns the thread's preview.
    const transition = (
      threadId: string,
      runId: number,
      state: ThreadPreviewState,
      expectedStatus?: ThreadPreviewState["status"],
    ) =>
      Ref.modify(runs, (current) => {
        const run = current[threadId];
        if (
          !run ||
          run.runId !== runId ||
          (expectedStatus && run.state.status !== expectedStatus)
        ) {
          return [{ applied: false, timeout: null }, current] as const;
        }
        const timeout = state.status === "starting" ? null : run.urlDetectionTimeout;
        return [
          { applied: true, timeout },
          {
            ...current,
            [threadId]: {
              ...run,
              state,
              urlDetectionTimeout: state.status === "starting" ? run.urlDetectionTimeout : null,
            },
          },
        ] as const;
      }).pipe(
        Effect.flatMap(({ applied, timeout }) => {
          if (!applied) {
            return Effect.void;
          }
          if (timeout) {
            clearTimeout(timeout);
          }
          return publish(state);
        }),
      );

    const resolveLaunch = (
      threadId: string,
    ): Effect.Effect<PreviewLaunchResolution, never, never> =>
      Effect.gen(function* () {
        const thread = yield* projection
          .getThreadShellById(ThreadId.makeUnsafe(threadId))
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        if (Option.isNone(thread)) {
          return { ok: false, message: THREAD_MISSING_MESSAGE } as const;
        }
        const project = yield* projection
          .getProjectShellById(thread.value.projectId)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        if (Option.isNone(project)) {
          return { ok: false, message: PROJECT_MISSING_MESSAGE } as const;
        }
        return buildPreviewLaunchPlan({
          threadId,
          workspaceRoot: project.value.workspaceRoot,
          worktreePath: thread.value.worktreePath,
          scripts: project.value.scripts,
        });
      });

    const closePreviewTerminal = (threadId: string) =>
      terminalManager
        .close({ threadId, terminalId: PREVIEW_TERMINAL_ID, deleteHistory: true })
        .pipe(Effect.catch(() => Effect.void));

    const registerRun = (state: ThreadPreviewState) =>
      Effect.gen(function* () {
        const runId = yield* Ref.modify(
          nextRunId,
          (current) => [current + 1, current + 1] as const,
        );
        yield* Ref.update(runs, (current) => ({
          ...current,
          [state.threadId]: {
            runId,
            state,
            lastOutputLine: null,
            outputTail: "",
            urlDetectionTimeout: null,
          },
        }));
        yield* publish(state);
        return runId;
      });

    const finishUrlDetection = (threadId: string, runId: number, url: string | null) =>
      Effect.gen(function* () {
        const run = (yield* Ref.get(runs))[threadId];
        if (!run || run.runId !== runId || run.state.status !== "starting") {
          return;
        }
        const running: ThreadPreviewState = { ...run.state, status: "running", url };
        yield* transition(threadId, runId, running, "starting");
      });

    const armUrlDetectionTimeout = (threadId: string, runId: number) =>
      Effect.gen(function* () {
        const timeout = setTimeout(() => {
          Effect.runFork(finishUrlDetection(threadId, runId, null));
        }, PREVIEW_URL_DETECTION_TIMEOUT_MS);
        timeout.unref?.();
        const attached = yield* Ref.modify(runs, (current) => {
          const run = current[threadId];
          if (!run || run.runId !== runId || run.state.status !== "starting") {
            return [false, current] as const;
          }
          return [
            true,
            { ...current, [threadId]: { ...run, urlDetectionTimeout: timeout } },
          ] as const;
        });
        if (!attached) {
          clearTimeout(timeout);
        }
      });

    const startPlan = (plan: PreviewLaunchPlan, starting: ThreadPreviewState, runId: number) =>
      Effect.gen(function* () {
        // A previous failed run may still hold the PTY; close it so the command
        // always lands in a fresh shell.
        yield* closePreviewTerminal(plan.threadId);

        const opened = yield* terminalManager
          .open({
            threadId: plan.threadId,
            terminalId: plan.terminalId,
            cwd: plan.cwd,
            cols: PREVIEW_TERMINAL_COLS,
            rows: PREVIEW_TERMINAL_ROWS,
            env: plan.env,
          })
          .pipe(
            Effect.map(() => ({ ok: true as const })),
            Effect.catch((error) => Effect.succeed({ ok: false as const, message: error.message })),
          );
        if (!opened.ok) {
          const failed = failedState(starting, opened.message);
          yield* transition(plan.threadId, runId, failed);
          return failed;
        }

        const written = yield* terminalManager
          .write({
            threadId: plan.threadId,
            terminalId: plan.terminalId,
            data: `${plan.command}\r`,
          })
          .pipe(
            Effect.map(() => ({ ok: true as const })),
            Effect.catch((error) => Effect.succeed({ ok: false as const, message: error.message })),
          );
        if (!written.ok) {
          const failed = failedState(starting, written.message);
          yield* transition(plan.threadId, runId, failed);
          yield* closePreviewTerminal(plan.threadId);
          return failed;
        }

        if (plan.url) {
          const running: ThreadPreviewState = { ...starting, status: "running", url: plan.url };
          yield* transition(plan.threadId, runId, running);
          return running;
        }

        yield* armUrlDetectionTimeout(plan.threadId, runId);
        return (yield* Ref.get(runs))[plan.threadId]?.state ?? starting;
      });

    const start: ThreadPreviewManagerShape["start"] = (input) =>
      Effect.gen(function* () {
        const threadId = input.threadId;
        const existing = (yield* Ref.get(runs))[threadId];
        if (existing && isActiveThreadPreview(existing.state)) {
          return { preview: existing.state };
        }

        const resolution = yield* resolveLaunch(threadId);
        if (!resolution.ok) {
          const failed = failedState(idleThreadPreview(threadId), resolution.message);
          yield* registerRun(failed);
          return { preview: failed };
        }

        const plan = resolution.plan;
        const starting: ThreadPreviewState = {
          threadId,
          status: "starting",
          terminalId: plan.terminalId,
          url: null,
          port: plan.port,
          message: null,
          scriptId: plan.scriptId,
          command: plan.command,
          cwd: plan.cwd,
          startedAt: new Date().toISOString(),
        };
        const runId = yield* registerRun(starting);
        const preview = yield* startPlan(plan, starting, runId);
        return { preview };
      });

    const stopPreview: ThreadPreviewManagerShape["stopPreview"] = (threadId) =>
      Effect.gen(function* () {
        // Drop the run before tearing the PTY down so its exit is never reported
        // as a crash.
        const removed = yield* Ref.modify(runs, (current) => {
          const run = current[threadId];
          if (!run) {
            return [{ tracked: false, timeout: null }, current] as const;
          }
          const next = { ...current };
          delete next[threadId];
          return [{ tracked: true, timeout: run.urlDetectionTimeout }, next] as const;
        });
        if (!removed.tracked) {
          return { stopped: false };
        }
        if (removed.timeout) {
          clearTimeout(removed.timeout);
        }
        yield* publish(idleThreadPreview(threadId));
        yield* closePreviewTerminal(threadId);
        return { stopped: true };
      });

    const recordOutput = (threadId: string, chunk: string) =>
      Ref.modify(runs, (current) => {
        const run = current[threadId];
        if (!run) {
          return [null, current] as const;
        }
        const line = lastTerminalOutputLine(chunk);
        const detection =
          run.state.status === "starting"
            ? detectPreviewUrl(run.outputTail, chunk)
            : { tail: run.outputTail, url: null };
        const nextRun = {
          ...run,
          lastOutputLine: line ?? run.lastOutputLine,
          outputTail: detection.tail,
        };
        return [
          detection.url ? { runId: run.runId, state: run.state, url: detection.url } : null,
          { ...current, [threadId]: nextRun },
        ] as const;
      }).pipe(
        Effect.flatMap((detected) => {
          if (!detected) {
            return Effect.void;
          }
          const url = resolvePreviewUrl({ detectedUrl: detected.url });
          const running: ThreadPreviewState = { ...detected.state, status: "running", url };
          return transition(threadId, detected.runId, running, "starting");
        }),
      );

    const setUrl: ThreadPreviewManagerShape["setUrl"] = (input) =>
      Effect.gen(function* () {
        const trimmed = input.url.trim();
        const candidate = /^https?:\/\//iu.test(trimmed) ? trimmed : `http://${trimmed}`;
        const parsed = yield* Effect.try({
          try: () => new URL(candidate),
          catch: () => new Error("Enter a valid HTTP(S) preview URL."),
        });
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return yield* Effect.fail(new Error("Enter a valid HTTP(S) preview URL."));
        }
        if (parsed.hostname === "0.0.0.0") {
          parsed.hostname = "localhost";
        }
        const run = (yield* Ref.get(runs))[input.threadId];
        if (!run || !isActiveThreadPreview(run.state)) {
          return yield* Effect.fail(new Error("Preview is not running."));
        }
        const preview: ThreadPreviewState = {
          ...run.state,
          status: "running",
          url: parsed.toString(),
        };
        yield* transition(input.threadId, run.runId, preview);
        return { preview };
      });

    // A PTY exit or error for a tracked run means the preview process died on its
    // own: surface it as `failed` with the last thing it printed.
    const failFromTerminal = (threadId: string, fallbackMessage: string) =>
      Ref.modify(runs, (current) => {
        const run = current[threadId];
        if (!run || run.state.status === "failed") {
          return [{ failed: null, timeout: null }, current] as const;
        }
        const failed = failedState(run.state, run.lastOutputLine ?? fallbackMessage);
        return [
          { failed, timeout: run.urlDetectionTimeout },
          {
            ...current,
            [threadId]: { ...run, state: failed, urlDetectionTimeout: null },
          },
        ] as const;
      }).pipe(
        Effect.flatMap(({ failed, timeout }) => {
          if (timeout) {
            clearTimeout(timeout);
          }
          return failed ? publish(failed) : Effect.void;
        }),
      );

    const unsubscribe = yield* terminalManager.subscribe((event) => {
      if (event.terminalId !== PREVIEW_TERMINAL_ID) {
        return;
      }
      if (event.type === "output") {
        Effect.runFork(recordOutput(event.threadId, event.data));
        return;
      }
      if (event.type === "exited") {
        const detail =
          event.exitCode === null
            ? "Preview process exited."
            : `Preview exited with code ${event.exitCode}.`;
        Effect.runFork(failFromTerminal(event.threadId, detail));
        return;
      }
      if (event.type === "error") {
        Effect.runFork(failFromTerminal(event.threadId, event.message));
      }
    });
    yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));

    const list: ThreadPreviewManagerShape["list"] = Ref.get(runs).pipe(
      Effect.map((current) => ({ previews: Object.values(current).map((run) => run.state) })),
    );

    return {
      start,
      stopPreview,
      setUrl,
      list,
      get stream() {
        return Stream.fromPubSub(pubsub);
      },
    } satisfies ThreadPreviewManagerShape;
  }),
);
