import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ORCHESTRATION_WS_METHODS,
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
import WebSocket from "ws";

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

function connectWebSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      reject(
        new Error(
          `WebSocket upgrade failed (${String(response.statusCode)} ${response.statusMessage}). If the server requires auth, set LUMINOR_AUTH_TOKEN to the desktop token.`,
        ),
      );
    });
  });
}

export class LuminorWsRpcClient {
  private constructor(private readonly socket: WebSocket) {}

  static async connect(input: {
    readonly homeDir: string;
    readonly authToken?: string | undefined;
  }): Promise<LuminorWsRpcClient> {
    const runtime = readLuminorServerRuntime(input.homeDir);
    const negotiation = await negotiateLuminorWs(runtime.origin);
    const socket = await connectWebSocket(
      buildFeatureSocketUrl(runtime.origin, negotiation, input.authToken),
    );
    return new LuminorWsRpcClient(socket);
  }

  async request<T>(tag: string, payload: unknown): Promise<T> {
    const requestId = randomUUID();
    const result = await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off("message", onMessage);
        reject(new Error(`RPC timed out for ${tag}`));
      }, REQUEST_TIMEOUT_MS);

      const onMessage = (data: WebSocket.RawData) => {
        const frame = JSON.parse(data.toString()) as RpcExitFrame | { readonly _tag: string };
        if (frame._tag !== "Exit" || frame.requestId !== requestId) {
          return;
        }
        clearTimeout(timeout);
        this.socket.off("message", onMessage);
        if (frame.exit._tag === "Success") {
          resolve(frame.exit.value as T);
          return;
        }
        reject(new Error(`RPC ${tag} failed: ${JSON.stringify(frame.exit.cause)}`));
      };

      this.socket.on("message", onMessage);
      this.socket.send(
        JSON.stringify({
          _tag: "Request",
          id: requestId,
          tag,
          payload,
          headers: [],
        }),
      );
    });
    return result;
  }

  close(): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
  }
}

export const LUMINOR_WS_RPC_TAGS = {
  dispatchCommand: ORCHESTRATION_WS_METHODS.dispatchCommand,
} as const;
