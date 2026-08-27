import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ORCHESTRATION_WS_METHODS,
  WsFeatureRpcGroup,
  WS_CLIENT_REQUIRED_CAPABILITIES,
  WS_COMPATIBILITY_QUERY,
  WS_FEATURE_PATH,
  WS_NEGOTIATE_HTTP_PATH,
  WS_NEGOTIATE_QUERY,
  WS_PROTOCOL_EPOCH,
  WS_PROTOCOL_MAX_REVISION,
  WS_PROTOCOL_MIN_REVISION,
  type WsBootstrapNegotiateResult,
} from "@luminor/contracts";
import { Cause, Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";

const CLIENT_BUILD = "thread-bulk-delete-cli";
const REQUEST_TIMEOUT_MS = 120_000;

export interface LuminorServerRuntime {
  readonly pid: number;
  readonly host: string;
  readonly port: number;
  readonly origin: string;
}

interface RpcExitFrame {
  readonly _tag: "Exit";
  readonly requestId: string;
  readonly exit:
    | { readonly _tag: "Success"; readonly value: unknown }
    | { readonly _tag: "Failure"; readonly cause: unknown };
}

interface RpcDefectFrame {
  readonly _tag: "Defect";
  readonly requestId: string;
  readonly defect: unknown;
}

type RpcResponseFrame = RpcExitFrame | RpcDefectFrame | { readonly _tag: string };

type RpcClientEffect = typeof makeRpcClient;
type RpcClientInstance =
  RpcClientEffect extends Effect.Effect<infer Client, unknown, unknown> ? Client : never;

const makeRpcClient = RpcClient.make(WsFeatureRpcGroup);

export function parseRpcResponseFrame(
  data: string,
  requestId: string,
):
  | { readonly kind: "ping" }
  | { readonly kind: "pending" }
  | { readonly kind: "success"; readonly value: unknown }
  | { readonly kind: "failure"; readonly message: string } {
  let frame: RpcResponseFrame;
  try {
    frame = JSON.parse(data) as RpcResponseFrame;
  } catch {
    return { kind: "pending" };
  }
  if (frame._tag === "Ping") {
    return { kind: "ping" };
  }
  if (frame._tag === "Ack" || frame._tag === "Chunk" || frame._tag === "Pong") {
    return { kind: "pending" };
  }
  if (frame._tag === "Defect") {
    const defectFrame = frame as RpcDefectFrame;
    if (defectFrame.requestId !== requestId) {
      return { kind: "pending" };
    }
    return {
      kind: "failure",
      message: `RPC defect: ${JSON.stringify(defectFrame.defect)}`,
    };
  }
  if (frame._tag !== "Exit") {
    return { kind: "pending" };
  }
  const exitFrame = frame as RpcExitFrame;
  if (exitFrame.requestId !== requestId) {
    return { kind: "pending" };
  }
  if (exitFrame.exit._tag === "Success") {
    return { kind: "success", value: exitFrame.exit.value };
  }
  return {
    kind: "failure",
    message: `RPC failed: ${JSON.stringify(exitFrame.exit.cause)}`,
  };
}

function makeProtocolLayer(url: string): Layer.Layer<RpcClient.Protocol> {
  const socketLayer = Socket.layerWebSocket(url).pipe(
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
  );
  return RpcClient.layerProtocolSocket().pipe(
    Layer.provideMerge(socketLayer),
    Layer.provideMerge(RpcSerialization.layerJson),
  );
}

function causeToError(cause: Cause.Cause<unknown>): Error {
  const error = Cause.squash(cause);
  return error instanceof Error ? error : new Error(String(error));
}

export function readLuminorServerRuntime(homeDir: string): LuminorServerRuntime {
  const runtimePath = join(homeDir, "dev", "server-runtime.json");
  if (!existsSync(runtimePath)) {
    throw new Error(`Missing server runtime file: ${runtimePath}`);
  }
  const raw = JSON.parse(readFileSync(runtimePath, "utf8")) as {
    pid?: unknown;
    host?: unknown;
    port?: unknown;
    origin?: unknown;
  };
  if (typeof raw.pid !== "number" || !Number.isInteger(raw.pid) || raw.pid <= 0) {
    throw new Error(`Invalid server runtime pid in ${runtimePath}`);
  }
  if (typeof raw.port !== "number" || !Number.isInteger(raw.port) || raw.port <= 0) {
    throw new Error(`Invalid server runtime port in ${runtimePath}`);
  }
  const host = typeof raw.host === "string" && raw.host.length > 0 ? raw.host : "127.0.0.1";
  const origin =
    typeof raw.origin === "string" && raw.origin.length > 0
      ? raw.origin
      : `http://${host}:${String(raw.port)}`;
  return { pid: raw.pid, host, port: raw.port, origin };
}

export function readAuthTokenFromProcessEnv(pid: number): string | undefined {
  try {
    const environ = readFileSync(`/proc/${String(pid)}/environ`);
    for (const entry of environ.toString("utf8").split("\0")) {
      if (!entry.startsWith("LUMINOR_AUTH_TOKEN=")) {
        continue;
      }
      const value = entry.slice("LUMINOR_AUTH_TOKEN=".length).trim();
      return value.length > 0 ? value : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function resolveLuminorAuthToken(input: {
  readonly homeDir: string;
  readonly explicitToken?: string | undefined;
}): string | undefined {
  const explicit = input.explicitToken?.trim();
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  const fromEnv = process.env.LUMINOR_AUTH_TOKEN?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  try {
    const runtime = readLuminorServerRuntime(input.homeDir);
    return readAuthTokenFromProcessEnv(runtime.pid);
  } catch {
    return undefined;
  }
}

export async function negotiateLuminorWs(origin: string): Promise<WsBootstrapNegotiateResult> {
  const url = new URL(WS_NEGOTIATE_HTTP_PATH, origin);
  url.searchParams.set(WS_NEGOTIATE_QUERY.clientBuild, CLIENT_BUILD);
  url.searchParams.set(WS_NEGOTIATE_QUERY.protocolEpoch, String(WS_PROTOCOL_EPOCH));
  url.searchParams.set(WS_NEGOTIATE_QUERY.minRevision, String(WS_PROTOCOL_MIN_REVISION));
  url.searchParams.set(WS_NEGOTIATE_QUERY.maxRevision, String(WS_PROTOCOL_MAX_REVISION));
  for (const capability of WS_CLIENT_REQUIRED_CAPABILITIES) {
    url.searchParams.append(WS_NEGOTIATE_QUERY.requiredCapability, capability);
  }

  const response = await fetch(url, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `WebSocket negotiation failed (${String(response.status)}): ${JSON.stringify(body)}`,
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("protocolEpoch" in body) ||
    !("negotiatedRevision" in body) ||
    !("serverInstanceId" in body)
  ) {
    throw new Error("WebSocket negotiation returned an unreadable payload.");
  }
  return body as WsBootstrapNegotiateResult;
}

export function buildFeatureSocketUrl(
  origin: string,
  negotiation: WsBootstrapNegotiateResult,
  authToken?: string,
): string {
  const wsOrigin = origin.replace(/^http/i, "ws");
  const url = new URL(WS_FEATURE_PATH, wsOrigin);
  url.searchParams.set(WS_COMPATIBILITY_QUERY.clientBuild, CLIENT_BUILD);
  url.searchParams.set(WS_COMPATIBILITY_QUERY.protocolEpoch, String(negotiation.protocolEpoch));
  url.searchParams.set(
    WS_COMPATIBILITY_QUERY.protocolRevision,
    String(negotiation.negotiatedRevision),
  );
  url.searchParams.set(WS_COMPATIBILITY_QUERY.serverInstanceId, negotiation.serverInstanceId);
  if (authToken && authToken.trim().length > 0) {
    url.searchParams.set("token", authToken.trim());
  }
  return url.toString();
}

export class LuminorWsRpcClient {
  private constructor(
    private readonly runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>,
    private readonly scope: Scope.Scope,
    private readonly client: RpcClientInstance,
  ) {}

  static async connect(input: {
    readonly homeDir: string;
    readonly authToken?: string | undefined;
  }): Promise<LuminorWsRpcClient> {
    const authToken = resolveLuminorAuthToken({
      homeDir: input.homeDir,
      explicitToken: input.authToken,
    });
    if (!authToken) {
      throw new Error(
        "Could not resolve LUMINOR_AUTH_TOKEN. Start Luminor desktop dev, or export the token before running --execute.",
      );
    }

    const runtimeInfo = readLuminorServerRuntime(input.homeDir);
    const negotiation = await negotiateLuminorWs(runtimeInfo.origin);
    const socketUrl = buildFeatureSocketUrl(runtimeInfo.origin, negotiation, authToken);
    const managedRuntime = ManagedRuntime.make(makeProtocolLayer(socketUrl));
    const scope = managedRuntime.runSync(Scope.make());
    const client = await managedRuntime.runPromise(Scope.provide(scope)(makeRpcClient));
    return new LuminorWsRpcClient(managedRuntime, scope, client);
  }

  async request<T>(tag: string, payload: unknown): Promise<T> {
    const call = (
      this.client as unknown as Record<string, (input: unknown) => Effect.Effect<T, unknown, never>>
    )[tag];
    if (!call) {
      throw new Error(`Unknown RPC method: ${tag}`);
    }
    return this.runtime.runPromise(
      call(payload).pipe(
        Effect.timeout(REQUEST_TIMEOUT_MS),
        Effect.catchCause((cause) => Effect.fail(causeToError(cause))),
      ),
    );
  }

  async close(): Promise<void> {
    await this.runtime.runPromise(Scope.close(this.scope, Exit.void)).catch(() => undefined);
    await this.runtime.dispose().catch(() => undefined);
  }
}

export const LUMINOR_WS_RPC_TAGS = {
  dispatchCommand: ORCHESTRATION_WS_METHODS.dispatchCommand,
} as const;

// Keep a stable id helper for execute callers/tests.
export const createRpcRequestId = (): string => randomUUID();
