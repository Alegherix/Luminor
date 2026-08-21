import { execFileSync } from "node:child_process";

import { DEFAULT_PORT, remoteAccessPolicyError, type ServerConfigShape } from "./config";
import { isLoopbackHost } from "./startupAccess";

export type RemoteListenDecision =
  | { readonly kind: "listen"; readonly host: string; readonly port: number }
  | { readonly kind: "skip"; readonly reason: string };

export function firstTailscaleIpv4(stdout: string): string | undefined {
  const token = stdout.trim().split(/\s+/)[0];
  if (!token) return undefined;
  const octets = token.split(".");
  if (octets.length !== 4) return undefined;
  const valid = octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const value = Number(octet);
    return value >= 0 && value <= 255;
  });
  return valid ? token : undefined;
}

export function lookupTailscaleIpv4(): string | undefined {
  try {
    const stdout = execFileSync("tailscale", ["ip", "-4"], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return firstTailscaleIpv4(stdout);
  } catch {
    return undefined;
  }
}

export function parseRemoteListenPort(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = typeof raw === "number" ? raw : Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) return undefined;
  return value;
}

export function resolveRemoteListenTarget(input: {
  readonly primaryHost: string | undefined;
  readonly configuredRemoteHost: string | undefined;
  readonly configuredRemotePort: string | number | undefined;
  readonly tailscaleIpv4: string | undefined;
  readonly publicUrl: URL | undefined;
  readonly allowInsecureRemote: boolean;
  readonly authToken: string | undefined;
  readonly devUrl: URL | undefined;
}): RemoteListenDecision {
  if (!isLoopbackHost(input.primaryHost)) {
    return { kind: "skip", reason: "primary bind is already remote" };
  }

  const host = input.configuredRemoteHost?.trim() || input.tailscaleIpv4?.trim();
  if (!host) {
    return {
      kind: "skip",
      reason: "no LUMINOR_REMOTE_HOST and tailscale IPv4 unavailable",
    };
  }
  if (isLoopbackHost(host)) {
    return { kind: "skip", reason: "remote host is loopback" };
  }

  const parsedPort = parseRemoteListenPort(input.configuredRemotePort);
  if (input.configuredRemotePort !== undefined && parsedPort === undefined) {
    return { kind: "skip", reason: "LUMINOR_REMOTE_PORT is not a valid TCP port" };
  }
  const port = parsedPort ?? DEFAULT_PORT;

  const policyError = remoteAccessPolicyError({
    host,
    authToken: input.authToken,
    devUrl: undefined,
    publicUrl: input.publicUrl,
    allowInsecureRemote: input.allowInsecureRemote,
  });
  if (policyError) {
    return { kind: "skip", reason: policyError };
  }

  return { kind: "listen", host, port };
}

export function resolveRemoteListenTargetFromConfig(
  config: Pick<
    ServerConfigShape,
    | "host"
    | "remoteHost"
    | "remotePort"
    | "publicUrl"
    | "allowInsecureRemote"
    | "authToken"
    | "devUrl"
  >,
  tailscaleIpv4: string | undefined = lookupTailscaleIpv4(),
): RemoteListenDecision {
  return resolveRemoteListenTarget({
    primaryHost: config.host,
    configuredRemoteHost: config.remoteHost,
    configuredRemotePort: config.remotePort,
    tailscaleIpv4,
    publicUrl: config.publicUrl,
    allowInsecureRemote: config.allowInsecureRemote,
    authToken: config.authToken,
    devUrl: config.devUrl,
  });
}
