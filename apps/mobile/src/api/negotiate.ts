import {
  WS_BOOTSTRAP_METHOD,
  WS_CLIENT_REQUIRED_CAPABILITIES,
  WS_PROTOCOL_EPOCH,
  WS_PROTOCOL_MAX_REVISION,
  WS_PROTOCOL_MIN_REVISION,
  WsBootstrapNegotiateInput,
  WsBootstrapNegotiateResult,
  WsCompatibilityError,
} from "@luminor/contracts";
import { Option, Schema } from "effect";

import { APP_CLIENT_BUILD } from "../version";
import { combineAbortSignals, createTimeoutSignal } from "./abort";
import { encodeRequest } from "./frames";
import { requestJson } from "./http";
import { FeatureRpcClient } from "./rpcClient";
import { makeBootstrapSocketUrl, makeNegotiateHttpUrl } from "./urls";

const NEGOTIATE_HTTP_TIMEOUT_MS = 5_000;

const TERMINAL_COMPATIBILITY_ERROR_CODES = new Set([
  "WS_NEGOTIATION_REQUIRED",
  "WS_PROTOCOL_INCOMPATIBLE",
  "WS_CAPABILITIES_INCOMPATIBLE",
]);

export function isTerminalCompatibilityFailure(error: unknown): boolean {
  if (Schema.is(WsCompatibilityError)(error)) {
    return error.retryable === false;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    TERMINAL_COMPATIBILITY_ERROR_CODES.has(error.code)
  );
}

export function createNegotiateInput(
  clientBuild: string = APP_CLIENT_BUILD,
): WsBootstrapNegotiateInput {
  return {
    protocolEpoch: WS_PROTOCOL_EPOCH,
    minRevision: WS_PROTOCOL_MIN_REVISION,
    maxRevision: WS_PROTOCOL_MAX_REVISION,
    clientBuild,
    requiredCapabilities: [...WS_CLIENT_REQUIRED_CAPABILITIES],
  };
}

export async function negotiateOverHttp(
  baseUrl: string,
  options: {
    readonly clientBuild?: string;
    readonly signal?: AbortSignal;
  } = {},
): Promise<WsBootstrapNegotiateResult | null> {
  const deadline = createTimeoutSignal(NEGOTIATE_HTTP_TIMEOUT_MS);
  const signal = options.signal ? combineAbortSignals([options.signal, deadline]) : deadline;
  let response: { status: number; ok: boolean; body: unknown };
  try {
    response = await requestJson({
      url: makeNegotiateHttpUrl(baseUrl, options.clientBuild),
      method: "GET",
      cache: "no-store",
      signal,
    });
  } catch {
    return null;
  }
  if (response.status === 426) {
    const issue = Schema.decodeUnknownOption(WsCompatibilityError)(response.body);
    if (Option.isSome(issue)) throw issue.value;
    throw new Error("WebSocket negotiation was refused with an unreadable 426 response.");
  }
  if (!response.ok) return null;
  const result = Schema.decodeUnknownOption(WsBootstrapNegotiateResult)(response.body);
  return Option.isSome(result) ? result.value : null;
}

export async function negotiateOverBootstrapSocket(
  baseUrl: string,
  options: {
    readonly clientBuild?: string;
    readonly signal?: AbortSignal;
    readonly openSocket?: (url: string) => WebSocket;
  } = {},
): Promise<WsBootstrapNegotiateResult> {
  const socket = (options.openSocket ?? ((url: string) => new WebSocket(url)))(
    makeBootstrapSocketUrl(baseUrl),
  );
  const client = new FeatureRpcClient(socket);
  try {
    return await client.request(
      WS_BOOTSTRAP_METHOD,
      createNegotiateInput(options.clientBuild),
      (value) => Schema.decodeUnknownPromise(WsBootstrapNegotiateResult)(value),
      options.signal,
    );
  } finally {
    client.close();
  }
}

export async function negotiateCompatibility(
  baseUrl: string,
  options: {
    readonly clientBuild?: string;
    readonly signal?: AbortSignal;
    readonly openSocket?: (url: string) => WebSocket;
  } = {},
): Promise<WsBootstrapNegotiateResult> {
  const httpResult = await negotiateOverHttp(baseUrl, options);
  if (httpResult) return httpResult;
  return negotiateOverBootstrapSocket(baseUrl, options);
}

export function encodeBootstrapNegotiateRequest(
  id: string,
  clientBuild: string = APP_CLIENT_BUILD,
): string {
  return encodeRequest(id, WS_BOOTSTRAP_METHOD, createNegotiateInput(clientBuild));
}
