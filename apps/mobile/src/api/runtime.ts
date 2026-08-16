import {
  ORCHESTRATION_WS_METHODS,
  OrchestrationShellStreamItem,
  OrchestrationSubscribeThreadInput,
  OrchestrationThreadStreamItem,
  WsCompatibilityError,
  type ClientOrchestrationCommand,
  type ModelSelection,
  type OrchestrationThreadShell,
  type ProviderApprovalDecision,
  type ProviderListModelsInput,
  type ThreadId,
  type TurnId,
  type WsBootstrapNegotiateResult,
} from "@luminor/contracts";
import { Option, Schema } from "effect";

import { applyShellStreamItem, emptyShellState, type ShellState } from "../state/shellReducer";
import { createStore } from "../state/store";
import {
  applyThreadStreamItem,
  openPendingInteractions,
  type ThreadDetailState,
} from "../state/threadReducer";
import { deriveThreadStatus, hasUnseenCompletion } from "../state/threadStatus";
import { exchangePairingCredential, issueWsToken } from "./auth";
import { createCommandApi, type MobileCommandApi } from "./commands";
import { fetchHealth, type HealthSnapshot } from "./health";
import { isTerminalCompatibilityFailure, negotiateCompatibility } from "./negotiate";
import { durableStore, secureStore } from "./persist";
import { FeatureRpcClient, waitForSocketOpen } from "./rpcClient";
import { MEMORY_STORE_KEYS, type KeyValueStore } from "./storage";
import type {
  ConnectionSnapshot,
  ServerInfo,
  ShellSnapshot,
  ShellThread,
  ThreadSnapshot,
} from "./types";
import { getReconnectRetryDelayMs } from "./backoff";
import { makeFeatureSocketUrl, normalizeBaseUrl } from "./urls";

export type RuntimeStores = {
  readonly settings: KeyValueStore;
  readonly secrets: KeyValueStore;
};

export type RuntimeOptions = {
  readonly stores?: RuntimeStores;
  readonly openSocket?: (url: string) => WebSocket;
};

type ThreadLease = {
  refs: number;
  stop: (() => void) | null;
  error: string | null;
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("Aborted."));
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new Error("Aborted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function toServerInfo(baseUrl: string, compatibility: WsBootstrapNegotiateResult): ServerInfo {
  return {
    baseUrl,
    serverBuild: compatibility.serverBuild,
    serverInstanceId: compatibility.serverInstanceId,
    protocolEpoch: compatibility.protocolEpoch,
    negotiatedRevision: compatibility.negotiatedRevision,
    capabilities: compatibility.capabilities,
  };
}

export class MobileRuntime {
  readonly connection = createStore<ConnectionSnapshot>({
    status: "closed",
    serverInfo: null,
    compatibility: null,
    lastError: null,
    paired: false,
    serverUrl: "",
  });
  readonly shell = createStore<ShellState>(emptyShellState);
  readonly threads = createStore<Record<string, ThreadDetailState | undefined>>({});
  readonly lastVisited = createStore<Record<string, string>>({});

  readonly api: MobileCommandApi;

  private client: FeatureRpcClient | null = null;
  private wsToken: string | null = null;
  private bearerToken: string | null = null;
  private lastServerInstanceId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: Promise<void> | null = null;
  private lifetime = new AbortController();
  private userStopped = true;
  private started = false;
  private shellStop: (() => void) | null = null;
  private readonly leases = new Map<string, ThreadLease>();
  private readonly stores: RuntimeStores;
  private readonly openSocket: (url: string) => WebSocket;
  private shellSnapshotCache: {
    shellState: ShellState;
    lastVisitedState: Record<string, string>;
    snapshot: ShellSnapshot;
  } | null = null;
  private readonly threadSnapshotCache = new Map<
    string,
    {
      detail: ThreadDetailState | undefined;
      loading: boolean;
      error: ThreadSnapshot["error"];
      snapshot: ThreadSnapshot;
    }
  >();

  constructor(options: RuntimeOptions = {}) {
    this.stores = options.stores ?? {
      settings: {
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => undefined,
      },
      secrets: {
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => undefined,
      },
    };
    this.openSocket = options.openSocket ?? ((url) => new WebSocket(url));
    this.api = createCommandApi(() => {
      if (!this.client) {
        throw new Error("Not connected to the Luminor server.");
      }
      return this.client;
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const [serverUrl, bearerToken, lastVisitedRaw] = await Promise.all([
      this.stores.settings.getItem(MEMORY_STORE_KEYS.serverUrl),
      this.stores.secrets.getItem(MEMORY_STORE_KEYS.bearerToken),
      this.stores.settings.getItem(MEMORY_STORE_KEYS.lastVisited),
    ]);
    this.bearerToken = bearerToken;
    if (lastVisitedRaw) {
      try {
        const parsed = JSON.parse(lastVisitedRaw) as Record<string, string>;
        this.lastVisited.setState(parsed);
      } catch {
        this.lastVisited.setState({});
      }
    }
    this.connection.setState((current) => ({
      ...current,
      serverUrl: serverUrl ?? "",
      paired: bearerToken !== null && bearerToken.length > 0,
    }));
    if (serverUrl && bearerToken) {
      this.userStopped = false;
      await this.connect();
    }
  }

  async setServerUrl(raw: string): Promise<void> {
    const serverUrl = raw.trim().length === 0 ? "" : normalizeBaseUrl(raw);
    await this.stores.settings.setItem(MEMORY_STORE_KEYS.serverUrl, serverUrl);
    this.connection.setState((current) => ({ ...current, serverUrl }));
  }

  async pair(credential: string): Promise<void> {
    const serverUrl = this.requireServerUrl();
    const result = await exchangePairingCredential(serverUrl, credential);
    this.bearerToken = result.sessionToken;
    await this.stores.secrets.setItem(MEMORY_STORE_KEYS.bearerToken, result.sessionToken);
    this.connection.setState((current) => ({ ...current, paired: true, lastError: null }));
    this.userStopped = false;
    await this.connect();
  }

  async forgetPairing(): Promise<void> {
    this.userStopped = true;
    this.bearerToken = null;
    this.wsToken = null;
    await this.stores.secrets.removeItem(MEMORY_STORE_KEYS.bearerToken);
    this.tearDownSocket();
    this.shell.setState(emptyShellState);
    this.threads.setState({});
    this.connection.setState((current) => ({
      ...current,
      status: "closed",
      paired: false,
      serverInfo: null,
      compatibility: null,
      lastError: null,
    }));
  }

  reconnect(): void {
    this.userStopped = false;
    void this.connect();
  }

  disconnect(): void {
    this.userStopped = true;
    this.lifetime.abort();
    this.lifetime = new AbortController();
    this.tearDownSocket();
    this.connection.setState((current) => ({
      ...current,
      status: "closed",
      lastError: null,
    }));
  }

  async testHealth(): Promise<HealthSnapshot> {
    return fetchHealth(this.requireServerUrl());
  }

  acquireThread(threadId: string): () => void {
    const existing = this.leases.get(threadId);
    if (existing) {
      existing.refs += 1;
    } else {
      this.leases.set(threadId, { refs: 1, stop: null, error: null });
      this.startThreadSubscription(threadId);
    }
    return () => {
      const lease = this.leases.get(threadId);
      if (!lease) return;
      lease.refs -= 1;
      if (lease.refs > 0) return;
      lease.stop?.();
      this.leases.delete(threadId);
    };
  }

  markThreadVisited(threadId: string): void {
    const visitedAt = new Date().toISOString();
    this.lastVisited.setState((current) => ({ ...current, [threadId]: visitedAt }));
    void this.stores.settings.setItem(
      MEMORY_STORE_KEYS.lastVisited,
      JSON.stringify(this.lastVisited.getState()),
    );
  }

  getShellSnapshot(): ShellSnapshot {
    const shell = this.shell.getState();
    const lastVisited = this.lastVisited.getState();
    const cached = this.shellSnapshotCache;
    if (cached && cached.shellState === shell && cached.lastVisitedState === lastVisited) {
      return cached.snapshot;
    }
    const snapshot: ShellSnapshot = {
      spaces: shell.spaces,
      folders: shell.folders,
      projects: shell.projects,
      snapshotSequence: shell.snapshotSequence,
      hydrated: shell.hydrated,
      threads: shell.threads.map((thread) =>
        this.toShellThread(thread, lastVisited[thread.id] ?? null),
      ),
    };
    this.shellSnapshotCache = { shellState: shell, lastVisitedState: lastVisited, snapshot };
    return snapshot;
  }

  private toShellThread(
    thread: OrchestrationThreadShell,
    lastVisitedAt: string | null,
  ): ShellThread {
    const status = deriveThreadStatus({
      latestTurn: thread.latestTurn,
      session: thread.session,
      hasPendingApprovals: thread.hasPendingApprovals,
      hasPendingUserInput: thread.hasPendingUserInput,
    });
    return {
      ...thread,
      status,
      unread: hasUnseenCompletion(thread.latestTurn, lastVisitedAt),
      needsAttention: status === "needs-attention",
    };
  }

  getThreadSnapshot(threadId: string): ThreadSnapshot {
    const detail = this.threads.getState()[threadId];
    const lease = this.leases.get(threadId);
    const loading = detail === undefined && lease !== undefined;
    const error = lease?.error ?? null;
    const cached = this.threadSnapshotCache.get(threadId);
    if (cached && cached.detail === detail && cached.loading === loading && cached.error === error) {
      return cached.snapshot;
    }
    const snapshot = this.buildThreadSnapshot(detail, loading, error);
    this.threadSnapshotCache.set(threadId, { detail, loading, error, snapshot });
    return snapshot;
  }

  private buildThreadSnapshot(
    detail: ThreadDetailState | undefined,
    loading: boolean,
    error: ThreadSnapshot["error"],
  ): ThreadSnapshot {
    if (!detail) {
      return {
        thread: null,
        messages: [],
        activities: [],
        latestTurn: null,
        pendingInteractions: [],
        proposedPlans: [],
        fileEdits: [],
        session: null,
        status: "idle",
        loading,
        error,
      };
    }
    const pendingInteractions = openPendingInteractions(detail.thread);
    return {
      thread: detail.thread,
      messages: detail.thread.messages,
      activities: detail.thread.activities,
      latestTurn: detail.thread.latestTurn,
      pendingInteractions,
      proposedPlans: detail.thread.proposedPlans,
      fileEdits: detail.thread.checkpoints,
      session: detail.thread.session,
      status: deriveThreadStatus({
        latestTurn: detail.thread.latestTurn,
        session: detail.thread.session,
        hasPendingApprovals: detail.thread.hasPendingApprovals,
        hasPendingUserInput: detail.thread.hasPendingUserInput,
        pendingInteractions,
      }),
      loading: false,
      error,
    };
  }

  private requireServerUrl(): string {
    const serverUrl = this.connection.getState().serverUrl.trim();
    if (!serverUrl) {
      throw new Error("Set a server URL first.");
    }
    return normalizeBaseUrl(serverUrl);
  }

  private async connect(): Promise<void> {
    if (this.userStopped) return;
    this.lifetime.abort();
    this.lifetime = new AbortController();
    const signal = this.lifetime.signal;
    this.connection.setState((current) => ({
      ...current,
      status: "connecting",
      lastError: null,
      compatibility: null,
    }));
    try {
      const serverUrl = this.requireServerUrl();
      if (!this.bearerToken) {
        this.connection.setState((current) => ({
          ...current,
          status: "closed",
          lastError: "Pair this device before connecting.",
        }));
        return;
      }
      const ticket = await issueWsToken(serverUrl, this.bearerToken, signal);
      this.wsToken = ticket.token;
      const compatibility = await negotiateCompatibility(serverUrl, {
        signal,
        openSocket: this.openSocket,
      });
      if (
        this.lastServerInstanceId !== null &&
        this.lastServerInstanceId !== compatibility.serverInstanceId
      ) {
        this.resetReadModel();
      }
      this.lastServerInstanceId = compatibility.serverInstanceId;
      const socket = this.openSocket(
        makeFeatureSocketUrl(serverUrl, compatibility, { wsToken: ticket.token }),
      );
      await waitForSocketOpen(socket, signal);
      this.tearDownSocket();
      this.client = new FeatureRpcClient(socket);
      socket.addEventListener("close", this.handleSocketClosed);
      this.connection.setState((current) => ({
        ...current,
        status: "open",
        serverInfo: toServerInfo(serverUrl, compatibility),
        lastError: null,
        compatibility: null,
      }));
      this.reconnectAttempt = 0;
      this.startShellSubscription();
      for (const threadId of this.leases.keys()) {
        this.startThreadSubscription(threadId);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (isTerminalCompatibilityFailure(error)) {
        this.connection.setState((current) => ({
          ...current,
          status: "incompatible",
          compatibility: Schema.is(WsCompatibilityError)(error) ? error : null,
          lastError: error instanceof Error ? error.message : "Server is incompatible.",
        }));
        this.tearDownSocket();
        return;
      }
      this.connection.setState((current) => ({
        ...current,
        status: "closed",
        lastError: error instanceof Error ? error.message : "Connection failed.",
      }));
      this.tearDownSocket();
      this.scheduleReconnect();
    }
  }

  private handleSocketClosed = () => {
    if (this.userStopped || this.connection.getState().status === "incompatible") return;
    this.connection.setState((current) => ({ ...current, status: "closed" }));
    this.scheduleReconnect();
  };

  private scheduleReconnect(): void {
    if (this.userStopped || this.reconnectTimer) return;
    const attempt = this.reconnectAttempt;
    this.reconnectAttempt += 1;
    const waitMs = getReconnectRetryDelayMs(attempt);
    const signal = this.lifetime.signal;
    this.reconnectTimer = delay(waitMs, signal)
      .catch(() => undefined)
      .then(() => {
        this.reconnectTimer = null;
        if (!this.userStopped && !signal.aborted) {
          return this.connect();
        }
        return undefined;
      });
  }

  private startShellSubscription(): void {
    this.shellStop?.();
    const client = this.client;
    if (!client) return;
    const subscription = client.subscribe(
      ORCHESTRATION_WS_METHODS.subscribeShell,
      {},
      {
        onItem: (value) => {
          const decoded = Schema.decodeUnknownOption(OrchestrationShellStreamItem)(value);
          if (Option.isNone(decoded)) return;
          this.shell.setState((current) => applyShellStreamItem(current, decoded.value));
        },
        onError: (error) => {
          this.connection.setState((current) => ({
            ...current,
            lastError: error instanceof Error ? error.message : "Shell stream failed.",
          }));
        },
      },
    );
    this.shellStop = subscription.stop;
  }

  private startThreadSubscription(threadId: string): void {
    const lease = this.leases.get(threadId);
    const client = this.client;
    if (!lease || !client) return;
    lease.stop?.();
    const detail = this.threads.getState()[threadId];
    const input: OrchestrationSubscribeThreadInput =
      detail && detail.cursor >= 0
        ? { threadId: threadId as ThreadId, afterSequence: detail.cursor }
        : { threadId: threadId as ThreadId };
    const subscription = client.subscribe(ORCHESTRATION_WS_METHODS.subscribeThread, input, {
      onItem: (value) => {
        const decoded = Schema.decodeUnknownOption(OrchestrationThreadStreamItem)(value);
        if (Option.isNone(decoded)) return;
        this.threads.setState((current) => ({
          ...current,
          [threadId]: applyThreadStreamItem(current[threadId] ?? null, decoded.value) ?? undefined,
        }));
      },
      onError: (error) => {
        lease.error = error instanceof Error ? error.message : "Thread stream failed.";
        this.threads.setState((current) => ({ ...current }));
      },
    });
    lease.stop = subscription.stop;
    lease.error = null;
  }

  private resetReadModel(): void {
    this.shell.setState(emptyShellState);
    this.threads.setState({});
  }

  private tearDownSocket(): void {
    this.shellStop?.();
    this.shellStop = null;
    for (const lease of this.leases.values()) {
      lease.stop?.();
      lease.stop = null;
    }
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.wsToken = null;
  }
}

let singleton: MobileRuntime | null = null;

export function getRuntime(): MobileRuntime {
  singleton ??= new MobileRuntime({
    stores: { settings: durableStore, secrets: secureStore },
  });
  return singleton;
}

export function configureRuntime(options: RuntimeOptions): MobileRuntime {
  singleton = new MobileRuntime(options);
  return singleton;
}

export const api: MobileCommandApi = {
  dispatchCommand: (command: ClientOrchestrationCommand) =>
    getRuntime().api.dispatchCommand(command),
  interrupt: (threadId: ThreadId, turnId?: TurnId) => getRuntime().api.interrupt(threadId, turnId),
  respondToApproval: (input: {
    readonly threadId: ThreadId;
    readonly requestId: string;
    readonly decision: ProviderApprovalDecision;
    readonly lifecycleGeneration?: string;
  }) => getRuntime().api.respondToApproval(input),
  setModelSelection: (threadId: ThreadId, modelSelection: ModelSelection) =>
    getRuntime().api.setModelSelection(threadId, modelSelection),
  listModels: (input: ProviderListModelsInput) => getRuntime().api.listModels(input),
};
