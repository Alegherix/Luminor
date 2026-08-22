import * as Crypto from "node:crypto";
import * as Path from "node:path";

import type {
  BrowserBlockingSurface,
  BrowserBlockingSurfaceResolveRequest,
  BrowserControlResult,
  BrowserDesktopControlRequest,
  BrowserDesktopControlResponse,
  BrowserDesktopInstanceId,
  BrowserFrameSequence,
  BrowserGeneration,
  BrowserGenerationBumpReason,
  BrowserDesktopWindowRevealRequest,
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
import type { WebContents } from "electron";
import { BrowserStreamLifecycle } from "@luminor/shared/browserStreamLifecycle";

import type { BrowserRemoteRuntime, DesktopBrowserManager } from "../browserManager";
import { getCdpSessionCoordinator } from "../browserAutomation/cdpRuntime";
import {
  resolveJavaScriptDialog,
  type BrowserOpenJavaScriptDialog,
} from "../browserAutomation/dialogHandling";
import type { OffscreenNativeInputBlockedReport } from "../browserOffscreen/nativeInputBlocking";
import { BrowserFrameAcquisition, type AcquiredBrowserFrame } from "./acquisition";

const MAX_BLOCKING_SURFACES = 8;
const REVEAL_FALLBACK_TEXT =
  "Open Luminor from your desktop or task switcher to continue in the desktop window.";

export function requireRemotelyAnswerableSurface(
  surface: BrowserBlockingSurface | undefined,
): BrowserBlockingSurface {
  if (!surface) throw new Error("Browser blocking surface is no longer available");
  if (!surface.remotelyAnswerable || surface.kind !== "javascript-dialog") {
    throw new Error("Browser blocking surface cannot be answered remotely");
  }
  return surface;
}

export class BrowserBlockingSurfaceStore {
  private surfaces: BrowserBlockingSurface[] = [];

  snapshot(): readonly BrowserBlockingSurface[] {
    return this.surfaces;
  }

  find(surfaceId: string): BrowserBlockingSurface | undefined {
    return this.surfaces.find((surface) => surface.id === surfaceId);
  }

  setJavaScriptDialog(tabId: BrowserTabId, dialog: BrowserOpenJavaScriptDialog | null): boolean {
    const withoutCurrent = this.surfaces.filter(
      (surface) => !(surface.tabId === tabId && surface.kind === "javascript-dialog"),
    );
    const next = dialog
      ? [
          ...withoutCurrent,
          {
            id: Crypto.randomUUID(),
            tabId,
            kind: "javascript-dialog" as const,
            dialogKind: dialog.kind,
            message: dialog.message,
            defaultPrompt: dialog.defaultPrompt,
            inputType: null,
            permission: null,
            renderable: false,
            remotelyAnswerable: true,
            autoResolution: null,
            openedAt: dialog.openedAt,
          },
        ].slice(-MAX_BLOCKING_SURFACES)
      : withoutCurrent;
    return this.replace(next);
  }

  addNativeInput(tabId: BrowserTabId, report: OffscreenNativeInputBlockedReport): boolean {
    const withoutDuplicate = this.surfaces.filter(
      (surface) =>
        !(
          surface.tabId === tabId &&
          surface.kind === report.kind &&
          surface.inputType === report.inputType
        ),
    );
    return this.replace(
      [
        ...withoutDuplicate,
        {
          id: Crypto.randomUUID(),
          tabId,
          kind: report.kind,
          dialogKind: null,
          message: null,
          defaultPrompt: null,
          inputType: report.inputType,
          permission: null,
          renderable: false,
          remotelyAnswerable: false,
          autoResolution: null,
          openedAt: new Date().toISOString(),
        },
      ].slice(-MAX_BLOCKING_SURFACES),
    );
  }

  addPermissionDenied(tabId: BrowserTabId, permission: string): boolean {
    const withoutDuplicate = this.surfaces.filter(
      (surface) =>
        !(
          surface.tabId === tabId &&
          surface.kind === "permission-prompt" &&
          surface.permission === permission
        ),
    );
    return this.replace(
      [
        ...withoutDuplicate,
        {
          id: Crypto.randomUUID(),
          tabId,
          kind: "permission-prompt",
          dialogKind: null,
          message: null,
          defaultPrompt: null,
          inputType: null,
          permission: permission.slice(0, 256),
          renderable: false,
          remotelyAnswerable: false,
          autoResolution: "denied",
          openedAt: new Date().toISOString(),
        } as const,
      ].slice(-MAX_BLOCKING_SURFACES),
    );
  }

  clearTab(tabId: BrowserTabId): boolean {
    return this.replace(this.surfaces.filter((surface) => surface.tabId !== tabId));
  }

  clearTabNotifications(tabId: BrowserTabId): boolean {
    return this.replace(
      this.surfaces.filter(
        (surface) => surface.tabId !== tabId || surface.kind === "javascript-dialog",
      ),
    );
  }

  remove(surfaceId: string): boolean {
    return this.replace(this.surfaces.filter((surface) => surface.id !== surfaceId));
  }

  clearAll(): boolean {
    return this.replace([]);
  }

  private replace(next: BrowserBlockingSurface[]): boolean {
    if (
      next.length === this.surfaces.length &&
      next.every((surface, index) => surface === this.surfaces[index])
    ) {
      return false;
    }
    this.surfaces = next;
    return true;
  }
}

interface RemoteThreadSession {
  readonly threadId: ThreadId;
  readonly lifecycle: BrowserStreamLifecycle;
  readonly subscriptionIds: Set<string>;
  viewport: BrowserViewport;
  runtime: BrowserRemoteRuntime | null;
  acquisition: BrowserFrameAcquisition | null;
  lastFrameSeq: BrowserFrameSequence | null;
  readonly mouseMoveCoalescer: BrowserMouseMoveCoalescer;
  readonly blockingSurfaces: BrowserBlockingSurfaceStore;
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
  if (state.seq === null || request.seq > state.seq) return "stale-frame";
  return null;
}

interface PendingMouseMoveDispatch {
  readonly generation: BrowserGeneration;
  readonly seq: BrowserFrameSequence;
  latest: BrowserInputDispatchRequest | null;
  result: Promise<BrowserInputDispatchResult>;
}

export class BrowserMouseMoveCoalescer {
  private pending: PendingMouseMoveDispatch | null = null;

  dispatch(
    request: BrowserInputDispatchRequest,
    send: (request: BrowserInputDispatchRequest) => Promise<BrowserInputDispatchResult>,
  ): Promise<BrowserInputDispatchResult> {
    if (this.pending?.generation === request.generation && this.pending.seq === request.seq) {
      this.pending.latest = request;
      return this.pending.result;
    }

    const pending: PendingMouseMoveDispatch = {
      generation: request.generation,
      seq: request.seq,
      latest: null,
      result: Promise.resolve({
        accepted: true,
        generation: request.generation,
        seq: request.seq,
      }),
    };
    pending.result = this.drain(request, pending, send).finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    this.pending = pending;
    return pending.result;
  }

  private async drain(
    initial: BrowserInputDispatchRequest,
    pending: PendingMouseMoveDispatch,
    send: (request: BrowserInputDispatchRequest) => Promise<BrowserInputDispatchResult>,
  ): Promise<BrowserInputDispatchResult> {
    let request: BrowserInputDispatchRequest | null = initial;
    let result: BrowserInputDispatchResult = {
      accepted: true,
      generation: initial.generation,
      seq: initial.seq,
    };
    while (request) {
      result = await send(request);
      request = pending.latest;
      pending.latest = null;
    }
    return result;
  }
}

export function marksRemoteHumanControl(request: BrowserInputDispatchRequest): boolean {
  const event = request.event;
  return (
    request.origin === "human" &&
    (event.kind === "key" ||
      event.kind === "insertText" ||
      event.kind === "wheel" ||
      (event.kind === "mouse" && event.type === "mousePressed"))
  );
}

export interface BrowserRemoteFrameControllerOptions {
  readonly workerPath?: string;
  readonly revealDesktopWindow?: (
    request: BrowserDesktopWindowRevealRequest,
  ) => boolean | Promise<boolean>;
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
    private readonly options: BrowserRemoteFrameControllerOptions = {},
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

  reportPermissionDenied(webContents: WebContents | null, permission: string): boolean {
    if (!webContents) return false;
    for (const session of this.sessions.values()) {
      if (session.runtime?.webContents !== webContents || session.subscriptionIds.size === 0) {
        continue;
      }
      void this.enqueue(session, async () => {
        if (session.runtime?.webContents !== webContents) return;
        if (
          session.blockingSurfaces.addPermissionDenied(
            session.runtime.tabId as BrowserTabId,
            permission,
          )
        ) {
          this.emitDelta(session);
        }
      });
      return true;
    }
    return false;
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
        this.clearBlockingTabNotifications(request.input.threadId, request.input.tabId);
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
        if (request.type === "closeTab") {
          this.clearBlockingTab(request.input.threadId, request.input.tabId);
        } else if (request.type !== "selectTab") {
          this.clearBlockingTabNotifications(request.input.threadId, request.input.tabId);
        }
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
      case "revealDesktopWindow": {
        this.assertGeneration(request.input.threadId, request.input.expectedGeneration);
        const revealed = (await this.options.revealDesktopWindow?.(request.input)) ?? false;
        return {
          type: "desktopWindowRevealed",
          result: { revealed, fallbackText: REVEAL_FALLBACK_TEXT },
        };
      }
      case "resolveBlockingSurface":
        return {
          type: "controlled",
          result: await this.resolveBlockingSurface(request.input),
        };
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeManager();
    for (const session of this.sessions.values()) {
      session.acquisition?.stop();
      session.blockingSurfaces.clearAll();
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
      session.blockingSurfaces.clearAll();
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
    session.blockingSurfaces.clearAll();
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
      mouseMoveCoalescer: new BrowserMouseMoveCoalescer(),
      blockingSurfaces: new BrowserBlockingSurfaceStore(),
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
      onJavaScriptDialog: (dialog) => {
        void this.enqueue(session, async () => {
          if (session.acquisition !== acquisition) return;
          const changed = session.blockingSurfaces.setJavaScriptDialog(
            runtime.tabId as BrowserTabId,
            dialog,
          );
          if (changed) this.emitDelta(session);
        });
      },
      onNativeInputBlocked: (report) => {
        void this.enqueue(session, async () => {
          if (session.acquisition !== acquisition) return;
          if (session.blockingSurfaces.addNativeInput(runtime.tabId as BrowserTabId, report)) {
            this.emitDelta(session);
          }
        });
      },
      onNavigation: () => {
        void this.enqueue(session, async () => {
          if (session.acquisition !== acquisition) return;
          if (session.blockingSurfaces.clearTabNotifications(runtime.tabId as BrowserTabId)) {
            this.emitDelta(session);
          }
        });
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
        session.blockingSurfaces.clearAll();
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
    session.blockingSurfaces.clearAll();
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
    session.blockingSurfaces.clearAll();
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

  private async resolveBlockingSurface(
    request: BrowserBlockingSurfaceResolveRequest,
  ): Promise<BrowserControlResult> {
    this.assertGeneration(request.threadId, request.expectedGeneration);
    const session = this.sessions.get(request.threadId);
    if (!session) throw new Error("Browser blocking surface is no longer available");
    const surface = requireRemotelyAnswerableSurface(
      session.blockingSurfaces.find(request.surfaceId),
    );
    const runtime = session.runtime;
    if (!runtime || runtime.tabId !== surface.tabId) {
      throw new Error("Browser blocking surface target is detached");
    }
    const resolved = await resolveJavaScriptDialog(runtime, {
      accept: request.resolution.action === "accept",
      ...(request.resolution.action === "accept" && request.resolution.promptText !== undefined
        ? { promptText: request.resolution.promptText }
        : {}),
    });
    if (!resolved) throw new Error("Browser JavaScript dialog is no longer open");
    if (session.blockingSurfaces.remove(surface.id)) this.emitDelta(session);
    return { state: this.snapshot(request.threadId) };
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
      return session.mouseMoveCoalescer.dispatch(request, (next) =>
        this.dispatchInputEvent(session, runtime, next),
      );
    }
    return this.dispatchInputEvent(session, runtime, request);
  }

  private async dispatchInputEvent(
    session: RemoteThreadSession,
    runtime: BrowserRemoteRuntime,
    request: BrowserInputDispatchRequest,
  ): Promise<BrowserInputDispatchResult> {
    const event = request.event;
    if (marksRemoteHumanControl(request)) {
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

  private clearBlockingTab(threadId: ThreadId, tabId: BrowserTabId): void {
    const session = this.sessions.get(threadId);
    if (session?.blockingSurfaces.clearTab(tabId)) this.emitDelta(session);
  }

  private clearBlockingTabNotifications(threadId: ThreadId, tabId: BrowserTabId): void {
    const session = this.sessions.get(threadId);
    if (session?.blockingSurfaces.clearTabNotifications(tabId)) this.emitDelta(session);
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
        hasBlockingSurface:
          session?.blockingSurfaces.snapshot().some((surface) => surface.tabId === tab.id) ?? false,
        openerTabId: (tab.openerTabId ??
          null) as ThreadBrowserStateSnapshot["tabs"][number]["openerTabId"],
      })),
      blocking: session ? [...session.blockingSurfaces.snapshot()] : [],
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
