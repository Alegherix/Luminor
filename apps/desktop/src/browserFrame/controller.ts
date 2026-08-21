import * as Crypto from "node:crypto";
import * as Path from "node:path";

import type {
  BrowserControlResult,
  BrowserDesktopControlRequest,
  BrowserDesktopControlResponse,
  BrowserDesktopInstanceId,
  BrowserFrameSequence,
  BrowserGeneration,
  BrowserGenerationBumpReason,
  BrowserInputDispatchRequest,
  BrowserInputDispatchResult,
  BrowserStateStreamEvent,
  BrowserStreamSubscribeResult,
  BrowserStreamUnsubscribeResult,
  BrowserTabId,
  BrowserViewport,
  ThreadBrowserStateSnapshot,
  ThreadId,
} from "@luminor/contracts";
import { BrowserStreamLifecycle } from "@luminor/shared/browserStreamLifecycle";

import type { BrowserRemoteRuntime, DesktopBrowserManager } from "../browserManager";
import { getCdpSessionCoordinator } from "../browserAutomation/cdpRuntime";
import { BrowserFrameAcquisition, type AcquiredBrowserFrame } from "./acquisition";

interface RemoteThreadSession {
  readonly threadId: ThreadId;
  readonly lifecycle: BrowserStreamLifecycle;
  readonly subscriptionIds: Set<string>;
  viewport: BrowserViewport;
  runtime: BrowserRemoteRuntime | null;
  acquisition: BrowserFrameAcquisition | null;
  lastFrameSeq: BrowserFrameSequence | null;
  pendingMouseMove: {
    readonly generation: BrowserGeneration;
    readonly seq: BrowserFrameSequence;
    readonly result: Promise<BrowserInputDispatchResult>;
  } | null;
  operation: Promise<void>;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
}

type StateListener = (event: BrowserStateStreamEvent) => void;
type FrameListener = (frame: AcquiredBrowserFrame) => void;

export interface BrowserInputFenceState {
  readonly desktopInstanceId: BrowserDesktopInstanceId;
  readonly threadId: ThreadId;
  readonly tabId: BrowserTabId;
  readonly generation: BrowserGeneration;
  readonly seq: BrowserFrameSequence | null;
  readonly streaming: boolean;
}

export function validateBrowserInputFence(
  request: BrowserInputDispatchRequest,
  state: BrowserInputFenceState | null,
): Extract<BrowserInputDispatchResult, { accepted: false }>["reason"] | null {
  if (!state) return "wrong-thread";
  if (request.desktopInstanceId !== state.desktopInstanceId) return "wrong-desktop";
  if (request.threadId !== state.threadId) return "wrong-thread";
  if (!state.streaming) return "target-detached";
  if (request.tabId !== state.tabId) return "wrong-tab";
  if (request.generation !== state.generation) return "stale-generation";
  if (request.seq !== state.seq) return "stale-frame";
  return null;
}

export interface BrowserRemoteFrameControllerOptions {
  readonly workerPath?: string;
}

export class BrowserRemoteFrameController {
  readonly desktopInstanceId = Crypto.randomUUID() as BrowserDesktopInstanceId;
  private readonly sessions = new Map<ThreadId, RemoteThreadSession>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly frameListeners = new Set<FrameListener>();
  private readonly unsubscribeManager: () => void;
  private readonly workerPath: string;
  private disposed = false;

  constructor(
    private readonly browserManager: DesktopBrowserManager,
    options: BrowserRemoteFrameControllerOptions = {},
  ) {
    this.workerPath = options.workerPath ?? Path.join(__dirname, "browserFrame", "jpegWorker.js");
    this.unsubscribeManager = browserManager.subscribe((state) => {
      const session = this.sessions.get(state.threadId);
      if (!session || session.subscriptionIds.size === 0) return;
      this.enqueue(session, () => this.reconcileRuntime(session));
    });
  }

  subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeFrames(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  async handleRequest(
    request: BrowserDesktopControlRequest,
  ): Promise<BrowserDesktopControlResponse> {
    switch (request.type) {
      case "subscribe":
        return {
          type: "subscribed",
          result: await this.subscribe(request.input.threadId, request.input.viewport),
        };
      case "unsubscribe":
        return {
          type: "unsubscribed",
          result: await this.unsubscribe(request.input.threadId, request.input.subscriptionId),
        };
      case "getState":
        return { type: "state", result: { state: this.snapshot(request.input.threadId) } };
      case "dispatchInput":
        return { type: "input", result: await this.dispatchInput(request.input) };
      case "resizeViewport":
        return {
          type: "controlled",
          result: await this.resize(
            request.input.threadId,
            request.input.expectedGeneration,
            request.input.viewport,
          ),
        };
      case "navigate": {
        this.assertGeneration(request.input.threadId, request.input.expectedGeneration);
        this.browserManager.navigate(request.input);
        await this.reconcile(request.input.threadId);
        return { type: "controlled", result: { state: this.snapshot(request.input.threadId) } };
      }
      case "goBack":
      case "goForward":
      case "reload":
      case "selectTab":
      case "closeTab": {
        this.assertGeneration(request.input.threadId, request.input.expectedGeneration);
        const method = {
          goBack: "goBack",
          goForward: "goForward",
          reload: "reload",
          selectTab: "selectTab",
          closeTab: "closeTab",
        }[request.type] as "goBack" | "goForward" | "reload" | "selectTab" | "closeTab";
        this.browserManager[method](request.input);
        await this.reconcile(request.input.threadId);
        return { type: "controlled", result: { state: this.snapshot(request.input.threadId) } };
      }
      case "createTab":
        this.assertGeneration(request.input.threadId, request.input.expectedGeneration);
        this.browserManager.newTab({
          threadId: request.input.threadId,
          ...(request.input.url === undefined ? {} : { url: request.input.url }),
          ...(request.input.activate === undefined ? {} : { activate: request.input.activate }),
        });
        await this.reconcile(request.input.threadId);
        return { type: "controlled", result: { state: this.snapshot(request.input.threadId) } };
      case "focus": {
        this.assertGeneration(request.input.threadId, request.input.expectedGeneration);
        this.browserManager.focusRemoteRuntime(request.input.threadId, request.input.focused);
        return { type: "controlled", result: { state: this.snapshot(request.input.threadId) } };
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeManager();
    for (const session of this.sessions.values()) {
      session.acquisition?.stop();
      if (session.recoveryTimer) clearTimeout(session.recoveryTimer);
      this.browserManager.deactivateRemoteRuntime(session.threadId);
    }
    this.sessions.clear();
    this.stateListeners.clear();
    this.frameListeners.clear();
  }

  private async subscribe(
    threadId: ThreadId,
    viewport: BrowserViewport,
  ): Promise<BrowserStreamSubscribeResult> {
    const session = this.sessions.get(threadId) ?? this.createSession(threadId, viewport);
    const viewportChanged =
      session.viewport.width !== viewport.width ||
      session.viewport.height !== viewport.height ||
      session.viewport.deviceScaleFactor !== viewport.deviceScaleFactor;
    session.viewport = viewport;
    const subscriptionId = Crypto.randomUUID();
    const wasEmpty = session.subscriptionIds.size === 0;
    session.subscriptionIds.add(subscriptionId);
    try {
      if (wasEmpty) await this.enqueue(session, () => this.startSession(session));
      else if (viewportChanged) {
        await this.resize(
          threadId,
          session.lifecycle.snapshot().generation as BrowserGeneration,
          viewport,
        );
      } else await session.operation;
    } catch (error) {
      session.subscriptionIds.delete(subscriptionId);
      session.acquisition?.stop();
      session.acquisition = null;
      session.runtime = null;
      if (wasEmpty) {
        session.lifecycle.transition({ type: "unsubscribe" });
        session.lifecycle.transition({ type: "stopped" });
        this.browserManager.deactivateRemoteRuntime(threadId);
      }
      throw error;
    }
    const state = this.snapshot(threadId);
    this.emitState({ type: "browser.state.snapshot", state, reason: "bootstrap" });
    return { subscriptionId, state, authorization: "viewer" };
  }

  private async unsubscribe(
    threadId: ThreadId,
    subscriptionId: string,
  ): Promise<BrowserStreamUnsubscribeResult> {
    const session = this.sessions.get(threadId);
    if (!session || !session.subscriptionIds.delete(subscriptionId)) return { released: false };
    if (session.subscriptionIds.size > 0) {
      this.emitDelta(session);
      return { released: true };
    }
    const transition = session.lifecycle.transition({ type: "unsubscribe" });
    this.emitInvalidation(session, transition.invalidatedGeneration, "stop");
    if (session.recoveryTimer) clearTimeout(session.recoveryTimer);
    session.recoveryTimer = null;
    session.acquisition?.stop();
    session.acquisition = null;
    session.runtime = null;
    session.lastFrameSeq = null;
    this.browserManager.deactivateRemoteRuntime(threadId);
    session.lifecycle.transition({ type: "stopped" });
    this.emitDelta(session);
    return { released: true };
  }

  private createSession(threadId: ThreadId, viewport: BrowserViewport): RemoteThreadSession {
    const session: RemoteThreadSession = {
      threadId,
      lifecycle: new BrowserStreamLifecycle(),
      subscriptionIds: new Set(),
      viewport,
      runtime: null,
      acquisition: null,
      lastFrameSeq: null,
      pendingMouseMove: null,
      operation: Promise.resolve(),
      recoveryTimer: null,
    };
    this.sessions.set(threadId, session);
    return session;
  }

  private async startSession(session: RemoteThreadSession): Promise<void> {
    session.lifecycle.transition({ type: "subscribe" });
    this.emitDelta(session);
    const runtime = await this.browserManager.activateRemoteRuntime(
      session.threadId,
      session.viewport,
    );
    if (!runtime) {
      session.lifecycle.transition({ type: "detach" });
      this.emitDelta(session);
      return;
    }
    await this.startAcquisition(session, runtime);
    session.lifecycle.transition({ type: "started" });
    this.emitDelta(session);
  }

  private async startAcquisition(
    session: RemoteThreadSession,
    runtime: BrowserRemoteRuntime,
  ): Promise<void> {
    session.runtime = runtime;
    session.lastFrameSeq = null;
    const generation = session.lifecycle.snapshot().generation as BrowserGeneration;
    const acquisition = new BrowserFrameAcquisition({
      desktopInstanceId: this.desktopInstanceId,
      generation,
      runtime,
      workerPath: this.workerPath,
      onFrame: (frame) => {
        if (session.acquisition !== acquisition) return;
        const identity = session.lifecycle.snapshot();
        if (identity.generation !== frame.header.generation || identity.state !== "streaming")
          return;
        session.lastFrameSeq = frame.header.seq;
        for (const listener of this.frameListeners) listener(frame);
      },
      onDetach: () => this.enqueue(session, () => this.recoverDetachedSession(session)),
    });
    session.acquisition = acquisition;
    await acquisition.start();
  }

  private async reconcile(threadId: ThreadId): Promise<void> {
    const session = this.sessions.get(threadId);
    if (!session) return;
    await this.enqueue(session, () => this.reconcileRuntime(session));
  }

  private async reconcileRuntime(session: RemoteThreadSession): Promise<void> {
    if (session.subscriptionIds.size === 0) return;
    const state = this.browserManager.getState({ threadId: session.threadId });
    if (!state.open || !state.activeTabId) {
      if (session.runtime) {
        const transition = session.lifecycle.transition({ type: "unsubscribe" });
        this.emitInvalidation(session, transition.invalidatedGeneration, "stop");
        session.acquisition?.stop();
        session.acquisition = null;
        session.runtime = null;
        session.lastFrameSeq = null;
        session.lifecycle.transition({ type: "stopped" });
      }
      this.emitDelta(session);
      return;
    }
    if (session.lifecycle.snapshot().state === "stopped") {
      await this.startSession(session);
      return;
    }
    if (!session.runtime) {
      const transition = session.lifecycle.transition({ type: "reattach" });
      this.emitInvalidation(session, transition.invalidatedGeneration, "reattach");
      const runtime = await this.browserManager.activateRemoteRuntime(
        session.threadId,
        session.viewport,
      );
      if (runtime) {
        await this.startAcquisition(session, runtime);
        session.lifecycle.transition({ type: "started" });
      }
      this.emitDelta(session);
      return;
    }
    if (session.runtime.tabId !== state.activeTabId) {
      await this.reconfigure(session, "tab-switch");
      return;
    }
    this.emitDelta(session);
  }

  private async reconfigure(
    session: RemoteThreadSession,
    reason: Extract<
      BrowserGenerationBumpReason,
      "reconfigure" | "resize" | "tab-switch" | "thread-switch" | "desktop-restart"
    >,
  ): Promise<void> {
    const transition = session.lifecycle.transition({ type: "reconfigure", reason });
    this.emitInvalidation(session, transition.invalidatedGeneration, reason);
    session.acquisition?.stop();
    session.acquisition = null;
    session.runtime = null;
    session.lastFrameSeq = null;
    this.emitDelta(session);
    const runtime = await this.browserManager.activateRemoteRuntime(
      session.threadId,
      session.viewport,
    );
    if (!runtime) return;
    await this.startAcquisition(session, runtime);
    session.lifecycle.transition({ type: "started" });
    this.emitDelta(session);
  }

  private async recoverDetachedSession(session: RemoteThreadSession): Promise<void> {
    if (session.subscriptionIds.size === 0) return;
    session.acquisition?.stop();
    session.acquisition = null;
    session.runtime = null;
    session.lastFrameSeq = null;
    if (session.lifecycle.snapshot().state !== "detached") {
      session.lifecycle.transition({ type: "detach" });
      this.emitDelta(session);
    }
    const transition = session.lifecycle.transition({ type: "reattach" });
    this.emitInvalidation(session, transition.invalidatedGeneration, "reattach");
    this.emitDelta(session);
    const runtime = await this.browserManager.activateRemoteRuntime(
      session.threadId,
      session.viewport,
    );
    if (!runtime) {
      this.scheduleRecovery(session);
      return;
    }
    try {
      await this.startAcquisition(session, runtime);
      session.lifecycle.transition({ type: "started" });
      this.emitDelta(session);
    } catch {
      const acquisition = session.acquisition as BrowserFrameAcquisition | null;
      acquisition?.stop();
      session.acquisition = null;
      session.runtime = null;
      session.lifecycle.transition({ type: "detach" });
      this.emitDelta(session);
      this.scheduleRecovery(session);
    }
  }

  private scheduleRecovery(session: RemoteThreadSession): void {
    if (session.recoveryTimer || session.subscriptionIds.size === 0) return;
    session.recoveryTimer = setTimeout(() => {
      session.recoveryTimer = null;
      this.enqueue(session, () => this.recoverDetachedSession(session));
    }, 250);
    session.recoveryTimer.unref();
  }

  private async resize(
    threadId: ThreadId,
    generation: BrowserGeneration,
    viewport: BrowserViewport,
  ): Promise<BrowserControlResult> {
    this.assertGeneration(threadId, generation);
    const session = this.sessions.get(threadId);
    if (!session) throw new Error("Browser stream is not subscribed");
    session.viewport = viewport;
    await this.enqueue(session, () => this.reconfigure(session, "resize"));
    return { state: this.snapshot(threadId) };
  }

  private async dispatchInput(
    request: BrowserInputDispatchRequest,
  ): Promise<BrowserInputDispatchResult> {
    const session = this.sessions.get(request.threadId);
    const current = session?.lifecycle.snapshot();
    const runtime = session?.runtime;
    const rejection = validateBrowserInputFence(
      request,
      session && runtime && current
        ? {
            desktopInstanceId: this.desktopInstanceId,
            threadId: session.threadId,
            tabId: runtime.tabId as BrowserTabId,
            generation: current.generation as BrowserGeneration,
            seq: session.lastFrameSeq,
            streaming: current.state === "streaming",
          }
        : null,
    );
    if (rejection) return this.rejectedInput(session, rejection);
    if (!session || !runtime) return this.rejectedInput(session, "target-detached");
    if (request.event.kind === "mouse" && request.event.type === "mouseMoved") {
      if (
        session.pendingMouseMove?.generation === request.generation &&
        session.pendingMouseMove.seq === request.seq
      ) {
        return session.pendingMouseMove.result;
      }
      const result = this.dispatchInputEvent(session, runtime, request);
      const pending = { generation: request.generation, seq: request.seq, result };
      session.pendingMouseMove = pending;
      try {
        return await result;
      } finally {
        if (session.pendingMouseMove === pending) session.pendingMouseMove = null;
      }
    }
    return this.dispatchInputEvent(session, runtime, request);
  }

  private async dispatchInputEvent(
    session: RemoteThreadSession,
    runtime: BrowserRemoteRuntime,
    request: BrowserInputDispatchRequest,
  ): Promise<BrowserInputDispatchResult> {
    const event = request.event;
    if (
      request.origin === "human" &&
      (event.kind === "key" ||
        event.kind === "insertText" ||
        (event.kind === "mouse" && event.type === "mousePressed"))
    ) {
      this.browserManager.markRemoteHumanControl(request.threadId);
    }
    try {
      const coordinator = getCdpSessionCoordinator(runtime.webContents);
      if (event.kind === "mouse" || event.kind === "wheel") {
        const { kind: _, ...params } = event;
        await coordinator.sendCommand("Input.dispatchMouseEvent", params);
      } else if (event.kind === "key") {
        const { kind: _, ...params } = event;
        await coordinator.sendCommand("Input.dispatchKeyEvent", params);
      } else {
        await coordinator.sendCommand("Input.insertText", { text: event.text });
      }
      return { accepted: true, generation: request.generation, seq: request.seq };
    } catch {
      return this.rejectedInput(session, "target-detached");
    }
  }

  private rejectedInput(
    session: RemoteThreadSession | null | undefined,
    reason: Extract<BrowserInputDispatchResult, { accepted: false }>["reason"],
  ): BrowserInputDispatchResult {
    return {
      accepted: false,
      reason,
      currentDesktopInstanceId: session ? this.desktopInstanceId : null,
      currentTabId: session?.runtime ? (session.runtime.tabId as BrowserTabId) : null,
      currentGeneration: session?.lifecycle.snapshot().generation
        ? (session.lifecycle.snapshot().generation as BrowserGeneration)
        : null,
      currentSeq: session?.lastFrameSeq ?? null,
    };
  }

  private assertGeneration(threadId: ThreadId, generation: BrowserGeneration): void {
    const current = this.sessions.get(threadId)?.lifecycle.snapshot().generation;
    if (current !== generation) throw new Error("Stale browser generation");
  }

  private snapshot(threadId: ThreadId): ThreadBrowserStateSnapshot {
    const state = this.browserManager.getState({ threadId });
    const session = this.sessions.get(threadId);
    const lifecycle = session?.lifecycle.snapshot() ?? {
      state: "stopped" as const,
      generation: 0,
      reason: null,
    };
    return {
      ...state,
      activeTabId: state.activeTabId as ThreadBrowserStateSnapshot["activeTabId"],
      tabs: state.tabs.map((tab) => ({
        ...tab,
        id: tab.id as ThreadBrowserStateSnapshot["tabs"][number]["id"],
      })),
      stream: {
        lifecycle: lifecycle.state,
        identity:
          session?.runtime && lifecycle.generation > 0
            ? {
                desktopInstanceId: this.desktopInstanceId,
                threadId,
                tabId: session.runtime.tabId as ThreadBrowserStateSnapshot["tabs"][number]["id"],
                generation: lifecycle.generation as BrowserGeneration,
              }
            : null,
        generationReason: lifecycle.reason,
        viewport: session?.viewport ?? { width: 1, height: 1, deviceScaleFactor: 1 },
        subscriberCount: session?.subscriptionIds.size ?? 0,
      },
    };
  }

  private emitInvalidation(
    session: RemoteThreadSession,
    generation: number | null,
    reason: BrowserGenerationBumpReason,
  ): void {
    if (generation === null) return;
    this.emitState({
      type: "browser.state.invalidated",
      threadId: session.threadId,
      previousDesktopInstanceId: this.desktopInstanceId,
      previousGeneration: generation as BrowserGeneration,
      reason,
    });
  }

  private emitDelta(session: RemoteThreadSession): void {
    this.emitState({ type: "browser.state.delta", state: this.snapshot(session.threadId) });
  }

  private emitState(event: BrowserStateStreamEvent): void {
    for (const listener of this.stateListeners) listener(event);
  }

  private enqueue(session: RemoteThreadSession, operation: () => Promise<void>): Promise<void> {
    session.operation = session.operation.then(operation, operation);
    return session.operation;
  }
}
