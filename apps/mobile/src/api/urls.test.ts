import {
  WS_CLIENT_REQUIRED_CAPABILITIES,
  WS_COMPATIBILITY_QUERY,
  WS_NEGOTIATE_QUERY,
  WS_PROTOCOL_EPOCH,
  WS_PROTOCOL_MAX_REVISION,
  WS_PROTOCOL_MIN_REVISION,
} from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { APP_CLIENT_BUILD } from "../version";
import {
  makeBearerBootstrapUrl,
  makeBootstrapSocketUrl,
  makeFeatureSocketUrl,
  makeHealthUrl,
  makeNegotiateHttpUrl,
  makeWsTokenUrl,
  normalizeBaseUrl,
} from "./urls";

describe("normalizeBaseUrl", () => {
  it("adds http when the host has no protocol and strips trailing slashes", () => {
    expect(normalizeBaseUrl("luminor.tailnet.ts.net:3773")).toBe(
      "http://luminor.tailnet.ts.net:3773",
    );
    expect(normalizeBaseUrl("https://host.example:8443/")).toBe("https://host.example:8443");
  });

  it("rejects empty URLs and credentialed URLs", () => {
    expect(() => normalizeBaseUrl("   ")).toThrow(/required/i);
    expect(() => normalizeBaseUrl("http://user:secret@host:3773")).toThrow(/credentials/i);
  });
});

describe("makeNegotiateHttpUrl", () => {
  it("builds /ws/negotiate with the contract query names and required capabilities", () => {
    const url = new URL(makeNegotiateHttpUrl("http://10.0.2.2:3773"));
    expect(url.protocol).toBe("http:");
    expect(url.pathname).toBe("/ws/negotiate");
    expect(url.searchParams.get(WS_NEGOTIATE_QUERY.clientBuild)).toBe(APP_CLIENT_BUILD);
    expect(url.searchParams.get(WS_NEGOTIATE_QUERY.protocolEpoch)).toBe(String(WS_PROTOCOL_EPOCH));
    expect(url.searchParams.get(WS_NEGOTIATE_QUERY.minRevision)).toBe(
      String(WS_PROTOCOL_MIN_REVISION),
    );
    expect(url.searchParams.get(WS_NEGOTIATE_QUERY.maxRevision)).toBe(
      String(WS_PROTOCOL_MAX_REVISION),
    );
    expect(url.searchParams.getAll(WS_NEGOTIATE_QUERY.requiredCapability)).toEqual([
      ...WS_CLIENT_REQUIRED_CAPABILITIES,
    ]);
  });

  it("converts a wss base URL to https for negotiation", () => {
    const url = new URL(makeNegotiateHttpUrl("wss://luminor.example"));
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/ws/negotiate");
  });
});

describe("feature and bootstrap socket URLs", () => {
  const compatibility = {
    protocolEpoch: 1,
    negotiatedRevision: 1,
    serverBuild: "server-1",
    serverInstanceId: "instance-abc",
    capabilities: ["orchestration.cursor-safe-streams"],
  };

  it("builds /ws with negotiated compatibility and an in-memory wsToken", () => {
    const url = new URL(
      makeFeatureSocketUrl("https://luminor.example:8443", compatibility, {
        wsToken: "ticket-1",
      }),
    );
    expect(url.protocol).toBe("wss:");
    expect(url.pathname).toBe("/ws");
    expect(url.searchParams.get(WS_COMPATIBILITY_QUERY.clientBuild)).toBe(APP_CLIENT_BUILD);
    expect(url.searchParams.get(WS_COMPATIBILITY_QUERY.protocolEpoch)).toBe("1");
    expect(url.searchParams.get(WS_COMPATIBILITY_QUERY.protocolRevision)).toBe("1");
    expect(url.searchParams.get(WS_COMPATIBILITY_QUERY.serverInstanceId)).toBe("instance-abc");
    expect(url.searchParams.get("wsToken")).toBe("ticket-1");
  });

  it("omits wsToken when pairing has not issued a ticket", () => {
    const url = new URL(makeFeatureSocketUrl("http://127.0.0.1:3773", compatibility));
    expect(url.searchParams.has("wsToken")).toBe(false);
  });

  it("targets the legacy bootstrap socket path over ws", () => {
    expect(makeBootstrapSocketUrl("http://10.0.2.2:3773")).toBe("ws://10.0.2.2:3773/ws/bootstrap");
  });
});

describe("auth and health HTTP URLs", () => {
  it("uses the documented pairing, ticket, and health paths", () => {
    expect(makeBearerBootstrapUrl("http://host:3773")).toBe(
      "http://host:3773/api/auth/bootstrap/bearer",
    );
    expect(makeWsTokenUrl("http://host:3773")).toBe("http://host:3773/api/auth/ws-token");
    expect(makeHealthUrl("http://host:3773")).toBe("http://host:3773/health");
  });
});
