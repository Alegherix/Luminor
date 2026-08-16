import {
  WS_BOOTSTRAP_PATH,
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

import { APP_CLIENT_BUILD } from "../version";

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Server URL is required.");
  }
  const withProtocol = /^(https?|wss?):\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.username || url.password) {
    throw new Error("Server URL must not include credentials.");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${pathname}`;
}

function rewriteProtocol(baseUrl: string, from: string, to: string): string {
  return baseUrl.startsWith(from) ? `${to}${baseUrl.slice(from.length)}` : baseUrl;
}

export function toHttpOrigin(baseUrl: string): URL {
  const normalized = normalizeBaseUrl(baseUrl);
  return new URL(
    rewriteProtocol(rewriteProtocol(normalized, "wss://", "https://"), "ws://", "http://"),
  );
}

export function toWsOrigin(baseUrl: string): URL {
  const normalized = normalizeBaseUrl(baseUrl);
  return new URL(
    rewriteProtocol(rewriteProtocol(normalized, "https://", "wss://"), "http://", "ws://"),
  );
}

export function makeHttpUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, `${toHttpOrigin(baseUrl).toString()}`).toString();
}

export function makeHealthUrl(baseUrl: string): string {
  return makeHttpUrl(baseUrl, "/health");
}

export function makeBearerBootstrapUrl(baseUrl: string): string {
  return makeHttpUrl(baseUrl, "/api/auth/bootstrap/bearer");
}

export function makeWsTokenUrl(baseUrl: string): string {
  return makeHttpUrl(baseUrl, "/api/auth/ws-token");
}

export function makeNegotiateHttpUrl(
  baseUrl: string,
  clientBuild: string = APP_CLIENT_BUILD,
): string {
  const url = new URL(WS_NEGOTIATE_HTTP_PATH, `${toHttpOrigin(baseUrl).toString()}`);
  url.searchParams.set(WS_NEGOTIATE_QUERY.clientBuild, clientBuild);
  url.searchParams.set(WS_NEGOTIATE_QUERY.protocolEpoch, String(WS_PROTOCOL_EPOCH));
  url.searchParams.set(WS_NEGOTIATE_QUERY.minRevision, String(WS_PROTOCOL_MIN_REVISION));
  url.searchParams.set(WS_NEGOTIATE_QUERY.maxRevision, String(WS_PROTOCOL_MAX_REVISION));
  for (const capability of WS_CLIENT_REQUIRED_CAPABILITIES) {
    url.searchParams.append(WS_NEGOTIATE_QUERY.requiredCapability, capability);
  }
  return url.toString();
}

export function makeBootstrapSocketUrl(baseUrl: string): string {
  return new URL(WS_BOOTSTRAP_PATH, `${toWsOrigin(baseUrl).toString()}`).toString();
}

export function makeFeatureSocketUrl(
  baseUrl: string,
  compatibility: WsBootstrapNegotiateResult,
  options: {
    readonly clientBuild?: string;
    readonly wsToken?: string;
  } = {},
): string {
  const url = new URL(WS_FEATURE_PATH, `${toWsOrigin(baseUrl).toString()}`);
  url.searchParams.set(WS_COMPATIBILITY_QUERY.clientBuild, options.clientBuild ?? APP_CLIENT_BUILD);
  url.searchParams.set(WS_COMPATIBILITY_QUERY.protocolEpoch, String(compatibility.protocolEpoch));
  url.searchParams.set(
    WS_COMPATIBILITY_QUERY.protocolRevision,
    String(compatibility.negotiatedRevision),
  );
  url.searchParams.set(WS_COMPATIBILITY_QUERY.serverInstanceId, compatibility.serverInstanceId);
  if (options.wsToken !== undefined && options.wsToken.length > 0) {
    url.searchParams.set("wsToken", options.wsToken);
  }
  return url.toString();
}
