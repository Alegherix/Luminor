import { randomUUID } from "node:crypto";

import type {
  BrowserControllerAcquireResult,
  BrowserControllerLease,
  BrowserControllerLeaseChangeResult,
  BrowserDesktopControlRequest,
  BrowserDesktopControlResponse,
  BrowserInputDispatchRequest,
  BrowserInputDispatchResult,
  BrowserFrameHeader,
  BrowserStateStreamEvent,
  BrowserStreamSubscribeInput,
  BrowserStreamSubscribeResult,
  BrowserStreamUnsubscribeResult,
  BrowserViewerPrincipal,
  ThreadBrowserStateSnapshot,
  ThreadId,
} from "@luminor/contracts";
import { Effect } from "effect";

import {
  connectBrowserHostControl,
  resolveBrowserHostCapability,
  resolveBrowserHostPipePath,
  type BrowserHostControlConnection,
} from "../browserAutomation/browserHostRpcClient.ts";
import {
  BrowserFrameIngress,
  resolveBrowserFrameCapability,
  resolveBrowserFramePipePath,
} from "./browserFrameIngress.ts";
import { BrowserFrameTransport } from "./browserFrameTransport.ts";

interface ViewerSubscription {
  readonly id: string;
  readonly clientId: BrowserClientId;
  readonly threadId: ThreadId;
  readonly principal: BrowserViewerPrincipal;
}

interface ThreadSubscriptionState {
  desktopSubscriptionId: string;
  readonly viewerIds: Set<string>;
}

interface ControllerLeaseState {
  readonly clientId: BrowserClientId;
  readonly principal: BrowserViewerPrincipal;
  readonly lease: BrowserControllerLease;
}

type StateListener = (event: BrowserStateStreamEvent) => void;
type BrowserClientId = string | number;

export function browserFrameMatchesState(
  frame: BrowserFrameHeader,
  state: ThreadBrowserStateSnapshot | undefined,
  desktopInstanceId: string | null,
): boolean {
  const identity = state?.stream.identity;
  return Boolean(
    identity &&
    identity.desktopInstanceId === frame.desktopInstanceId &&
    identity.tabId === frame.tabId &&
    identity.generation === frame.generation &&
    desktopInstanceId === frame.desktopInstanceId,
  );
}

export interface BrowserPaneManagerOptions {
  readonly connectControl?: () => Promise<BrowserHostControlConnection>;
}

export class BrowserPaneManager {
  readonly frames = new BrowserFrameTransport();
  private readonly viewerSubscriptions = new Map<string, ViewerSubscription>();
  private readonly subscriptionsByThread = new Map<ThreadId, ThreadSubscriptionState>();
  private readonly leases = new Map<ThreadId, ControllerLeaseState>();
  private readonly states = new Map<ThreadId, ThreadBrowserStateSnapshot>();
  private readonly listenersByThread = new Map<ThreadId, Set<StateListener>>();
  private readonly threadOperations = new Map<ThreadId, Promise<void>>();
  private controlConnection: BrowserHostControlConnection | null = null;
  private connecting: Promise<BrowserHostControlConnection> | null = null;
  private frameDesktopInstanceId: string | null = null;
  private readonly pipePath: string | null;
  private readonly capability: string | null;
  private readonly frameIngress: BrowserFrameIngress | null;
  private readonly connectControlFactory: (() => Promise<BrowserHostControlConnection>) | null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(env: NodeJS.ProcessEnv = process.env, options: BrowserPaneManagerOptions = {}) {
    this.pipePath = resolveBrowserHostPipePath(env);
    this.capability = resolveBrowserHostCapability(env);
    this.connectControlFactory =
      options.connectControl ??
      (this.pipePath && this.capability
        ? () =>
            connectBrowserHostControl({
              pipePath: this.pipePath!,
              capability: this.capability!,
            })
        : null);
    const framePipePath = resolveBrowserFramePipePath(env);
    const frameCapability = resolveBrowserFrameCapability(env);
    this.frameIngress =
      framePipePath && frameCapability
        ? new BrowserFrameIngress({
            pipePath: framePipePath,
            capability: frameCapability,
            onDesktop: (desktopInstanceId) => {
              const changed =
                this.frameDesktopInstanceId !== null &&
                this.frameDesktopInstanceId !== desktopInstanceId;
              this.frameDesktopInstanceId = desktopInstanceId;
              if (changed) this.invalidateAll("desktop-restart");
            },
            onFrame: (decoded, encoded) => {
              if (!decoded.ok || decoded.frame.header.payloadType !== "browser") return;
              const { frame } = decoded.frame.header;
              const state = this.states.get(frame.threadId);
              if (!browserFrameMatchesState(frame, state, this.frameDesktopInstanceId)) return;
              this.frames.publish(frame.threadId, encoded);
            },
            onDisconnect: () => {
              this.frameDesktopInstanceId = null;
              this.invalidateAll("desktop-restart");
            },
          })
        : null;
    if (this.frameIngress) {
      void this.frameIngress
        .start()
        .catch((error) => this.audit("browser-frame-ingress-failed", { error: String(error) }));
    }
  }

  async subscribeViewer(
    clientId: BrowserClientId,
    principal: BrowserViewerPrincipal,
    input: BrowserStreamSubscribeInput,
  ): Promise<{ readonly subscriptionId: string; readonly result: BrowserStreamSubscribeResult }> {
    return this.enqueueThread(input.threadId, () =>
      this.subscribeViewerLocked(clientId, principal, input),
    );
  }

  private async subscribeViewerLocked(
    clientId: BrowserClientId,
    principal: BrowserViewerPrincipal,
    input: BrowserStreamSubscribeInput,
  ): Promise<{ readonly subscriptionId: string; readonly result: BrowserStreamSubscribeResult }> {
    let threadState = this.subscriptionsByThread.get(input.threadId);
    let state: ThreadBrowserStateSnapshot;
    if (!threadState) {
      const response = await this.control({ type: "subscribe", input });
      if (response.type !== "subscribed")
        throw new Error("Desktop returned an invalid subscribe response");
      threadState = {
        desktopSubscriptionId: response.result.subscriptionId,
        viewerIds: new Set(),
      };
      this.subscriptionsByThread.set(input.threadId, threadState);
      this.states.set(input.threadId, response.result.state);
      state = response.result.state;
    } else {
      state = this.requireState(input.threadId);
    }
    const subscriptionId = randomUUID();
    const subscription: ViewerSubscription = {
      id: subscriptionId,
      clientId,
      threadId: input.threadId,
      principal,
    };
    this.viewerSubscriptions.set(subscriptionId, subscription);
    threadState.viewerIds.add(subscriptionId);
    state = this.withSubscriberCount(state, threadState.viewerIds.size);
    this.states.set(input.threadId, state);
    this.audit("browser-viewer-subscribed", {
      clientId,
      subscriptionId,
      threadId: input.threadId,
      ownerKind: principal.ownerKind,
      ownerId: principal.ownerId,
    });
    return {
      subscriptionId,
      result: { subscriptionId, state, authorization: "viewer" },
    };
  }

  async unsubscribeViewer(
    clientId: BrowserClientId,
    threadId: ThreadId,
    subscriptionId: string,
  ): Promise<BrowserStreamUnsubscribeResult> {
    return this.enqueueThread(threadId, () =>
      this.unsubscribeViewerLocked(clientId, threadId, subscriptionId),
    );
  }

  private async unsubscribeViewerLocked(
    clientId: BrowserClientId,
    threadId: ThreadId,
    subscriptionId: string,
  ): Promise<BrowserStreamUnsubscribeResult> {
    const subscription = this.viewerSubscriptions.get(subscriptionId);
    if (!subscription || subscription.clientId !== clientId || subscription.threadId !== threadId) {
      return { released: false };
    }
    this.viewerSubscriptions.delete(subscriptionId);
    const threadState = this.subscriptionsByThread.get(threadId);
    threadState?.viewerIds.delete(subscriptionId);
    if (threadState?.viewerIds.size === 0) {
      this.subscriptionsByThread.delete(threadId);
      await this.control({
        type: "unsubscribe",
        input: { threadId, subscriptionId: threadState.desktopSubscriptionId },
      });
    } else if (threadState) {
      const state = this.withSubscriberCount(
        this.requireState(threadId),
        threadState.viewerIds.size,
      );
      this.states.set(threadId, state);
    }
    this.releaseLeaseForClient(clientId, threadId);
    this.audit("browser-viewer-unsubscribed", { clientId, subscriptionId, threadId });
    return { released: true };
  }

  subscribeState(threadId: ThreadId, listener: StateListener): () => void {
    const listeners = this.listenersByThread.get(threadId) ?? new Set();
    listeners.add(listener);
    this.listenersByThread.set(threadId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listenersByThread.delete(threadId);
    };
  }

  hasViewer(clientId: BrowserClientId, threadId: ThreadId): boolean {
    return [...(this.subscriptionsByThread.get(threadId)?.viewerIds ?? [])].some(
      (id) => this.viewerSubscriptions.get(id)?.clientId === clientId,
    );
  }

  isPrincipalAuthorized(threadId: ThreadId, principal: BrowserViewerPrincipal): boolean {
    return [...(this.subscriptionsByThread.get(threadId)?.viewerIds ?? [])].some((id) => {
      const viewer = this.viewerSubscriptions.get(id);
      return (
        viewer?.principal.ownerKind === principal.ownerKind &&
        viewer.principal.ownerId === principal.ownerId
      );
    });
  }

  getState(threadId: ThreadId): ThreadBrowserStateSnapshot {
    return this.requireState(threadId);
  }

  async controlForViewer(
    clientId: BrowserClientId,
    request: BrowserDesktopControlRequest,
  ): Promise<BrowserDesktopControlResponse> {
    if (!this.hasViewer(clientId, request.input.threadId))
      throw new Error("Browser viewer is not authorized");
    if (
      request.type !== "getState" &&
      request.type !== "subscribe" &&
      request.type !== "unsubscribe" &&
      !this.isController(clientId, request.input.threadId)
    ) {
      throw new Error("Browser controller lease is required");
    }
    const response = await this.control(request);
    if (response.type === "controlled" || response.type === "state") {
      this.states.set(request.input.threadId, response.result.state);
    }
    return response;
  }

  async dispatchInput(
    clientId: BrowserClientId,
    request: BrowserInputDispatchRequest,
  ): Promise<BrowserInputDispatchResult> {
    if (!this.hasViewer(clientId, request.threadId)) {
      return this.inputRejection(request.threadId, "viewer-read-only");
    }
    if (!this.isController(clientId, request.threadId)) {
      return this.inputRejection(request.threadId, "controller-required");
    }
    const response = await this.control({ type: "dispatchInput", input: request });
    if (response.type !== "input") throw new Error("Desktop returned an invalid input response");
    return response.result;
  }

  acquireController(
    clientId: BrowserClientId,
    principal: BrowserViewerPrincipal,
    threadId: ThreadId,
  ): BrowserControllerAcquireResult {
    if (!this.hasViewer(clientId, threadId))
      return { granted: false, reason: "controller-unavailable" };
    const existing = this.leases.get(threadId);
    if (existing) {
      return existing.clientId === clientId
        ? { granted: true, lease: existing.lease }
        : { granted: false, reason: "controller-unavailable" };
    }
    const lease: BrowserControllerLease = {
      leaseId: randomUUID(),
      threadId,
      controllerId: String(clientId),
      acquiredAt: new Date().toISOString(),
    };
    this.leases.set(threadId, { clientId, principal, lease });
    this.audit("browser-controller-acquired", { clientId, threadId, leaseId: lease.leaseId });
    return { granted: true, lease };
  }

  releaseController(
    clientId: BrowserClientId,
    threadId: ThreadId,
    leaseId?: string,
  ): BrowserControllerLeaseChangeResult {
    const existing = this.leases.get(threadId);
    if (
      !existing ||
      existing.clientId !== clientId ||
      (leaseId && existing.lease.leaseId !== leaseId)
    ) {
      return { released: false };
    }
    this.leases.delete(threadId);
    this.audit("browser-controller-released", {
      clientId,
      threadId,
      leaseId: existing.lease.leaseId,
    });
    return { released: true };
  }

  disconnect(clientId: BrowserClientId): void {
    const subscriptions = [...this.viewerSubscriptions.values()].filter(
      (subscription) => subscription.clientId === clientId,
    );
    for (const subscription of subscriptions) {
      void this.unsubscribeViewer(clientId, subscription.threadId, subscription.id).catch((error) =>
        this.audit("browser-viewer-disconnect-failed", { clientId, error: String(error) }),
      );
    }
    for (const [threadId, lease] of this.leases) {
      if (lease.clientId === clientId)
        this.releaseController(clientId, threadId, lease.lease.leaseId);
    }
  }

  private async control(
    request: BrowserDesktopControlRequest,
  ): Promise<BrowserDesktopControlResponse> {
    const connection = await this.ensureControlConnection();
    return connection.request(request);
  }

  private async ensureControlConnection(): Promise<BrowserHostControlConnection> {
    if (this.controlConnection) return this.controlConnection;
    if (this.connecting) return this.connecting;
    if (!this.connectControlFactory) throw new Error("Desktop browser host is unavailable");
    this.connecting = this.connectControlFactory()
      .then((connection) => {
        connection.subscribeState((event) => this.handleDesktopState(event));
        connection.subscribeClose(() => {
          if (this.controlConnection !== connection) return;
          this.controlConnection = null;
          this.invalidateAll("desktop-restart");
          this.scheduleRecovery();
        });
        this.controlConnection = connection;
        return connection;
      })
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  private handleDesktopState(event: BrowserStateStreamEvent): void {
    const threadId =
      event.type === "browser.state.invalidated" ? event.threadId : event.state.threadId;
    let emitted = event;
    if (event.type !== "browser.state.invalidated") {
      const count = this.subscriptionsByThread.get(threadId)?.viewerIds.size ?? 0;
      const state = this.withSubscriberCount(event.state, count);
      this.states.set(threadId, state);
      emitted =
        event.type === "browser.state.snapshot"
          ? { ...event, state }
          : { type: "browser.state.delta", state };
    }
    this.emit(threadId, emitted);
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer || this.subscriptionsByThread.size === 0) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      void this.recoverSubscriptions().catch(() => this.scheduleRecovery());
    }, 250);
    this.recoveryTimer.unref();
  }

  private async recoverSubscriptions(): Promise<void> {
    const connection = await this.ensureControlConnection();
    for (const [threadId, subscription] of this.subscriptionsByThread) {
      const viewport = this.states.get(threadId)?.stream.viewport ?? {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
      };
      const response = await connection.request({
        type: "subscribe",
        input: { threadId, viewport },
      });
      if (response.type !== "subscribed") throw new Error("Desktop resubscribe failed");
      subscription.desktopSubscriptionId = response.result.subscriptionId;
      const state = this.withSubscriberCount(response.result.state, subscription.viewerIds.size);
      this.states.set(threadId, state);
      this.emit(threadId, { type: "browser.state.snapshot", state, reason: "desktop-restart" });
    }
  }

  private invalidateAll(reason: "desktop-restart"): void {
    for (const [threadId, state] of this.states) {
      const identity = state.stream.identity;
      if (!identity) continue;
      this.states.set(threadId, {
        ...state,
        stream: {
          ...state.stream,
          lifecycle: "detached",
          identity: null,
          generationReason: reason,
        },
      });
      this.emit(threadId, {
        type: "browser.state.invalidated",
        threadId,
        previousDesktopInstanceId: identity.desktopInstanceId,
        previousGeneration: identity.generation,
        reason,
      });
    }
  }

  private emit(threadId: ThreadId, event: BrowserStateStreamEvent): void {
    for (const listener of this.listenersByThread.get(threadId) ?? []) listener(event);
  }

  private requireState(threadId: ThreadId): ThreadBrowserStateSnapshot {
    const state = this.states.get(threadId);
    if (!state) throw new Error("Browser state is unavailable for this thread");
    return state;
  }

  private withSubscriberCount(
    state: ThreadBrowserStateSnapshot,
    subscriberCount: number,
  ): ThreadBrowserStateSnapshot {
    return { ...state, stream: { ...state.stream, subscriberCount } };
  }

  private isController(clientId: BrowserClientId, threadId: ThreadId): boolean {
    return this.leases.get(threadId)?.clientId === clientId;
  }

  private releaseLeaseForClient(clientId: BrowserClientId, threadId: ThreadId): void {
    const lease = this.leases.get(threadId);
    if (lease?.clientId === clientId && !this.hasViewer(clientId, threadId)) {
      this.releaseController(clientId, threadId, lease.lease.leaseId);
    }
  }

  private inputRejection(
    threadId: ThreadId,
    reason: "controller-required" | "viewer-read-only",
  ): BrowserInputDispatchResult {
    const identity = this.states.get(threadId)?.stream.identity;
    return {
      accepted: false,
      reason,
      currentDesktopInstanceId: identity?.desktopInstanceId ?? null,
      currentTabId: identity?.tabId ?? null,
      currentGeneration: identity?.generation ?? null,
      currentSeq: null,
    };
  }

  private enqueueThread<Result>(
    threadId: ThreadId,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const previous = this.threadOperations.get(threadId) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    const settled = current.then(
      () => undefined,
      () => undefined,
    );
    this.threadOperations.set(threadId, settled);
    void settled.then(() => {
      if (this.threadOperations.get(threadId) === settled) this.threadOperations.delete(threadId);
    });
    return current;
  }

  private audit(event: string, fields: Record<string, unknown>): void {
    Effect.runFork(Effect.logInfo(event, fields));
  }
}

export const browserPaneManager = new BrowserPaneManager();
