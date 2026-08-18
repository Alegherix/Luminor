import { describe, expect, it } from "vitest";

import {
  formatHostForUrl,
  isLoopbackAddress,
  isLoopbackHost,
  isWildcardHost,
  requestLocalAddress,
  resolveListeningPort,
} from "./startupAccess";

describe("startupAccess", () => {
  it("detects wildcard hosts", () => {
    expect(isWildcardHost("0.0.0.0")).toBe(true);
    expect(isWildcardHost("::")).toBe(true);
    expect(isWildcardHost("127.0.0.1")).toBe(false);
  });

  it("detects loopback hosts", () => {
    expect(isLoopbackHost(undefined)).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.50")).toBe(false);
  });

  it("classifies accepted sockets by localAddress rather than bind config", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("[::1]")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress("100.64.1.20")).toBe(false);
    expect(isLoopbackAddress("0.0.0.0")).toBe(false);
    expect(isLoopbackAddress("127.0.0.2")).toBe(false);
    expect(requestLocalAddress({ source: { socket: { localAddress: "100.64.1.20" } } })).toBe(
      "100.64.1.20",
    );
    expect(requestLocalAddress({ source: {} })).toBeUndefined();
  });

  it("formats IPv6 hosts for URLs", () => {
    expect(formatHostForUrl("::1")).toBe("[::1]");
    expect(formatHostForUrl("127.0.0.1")).toBe("127.0.0.1");
  });

  it("prefers the actual bound port when an HTTP server address is available", () => {
    expect(resolveListeningPort({ port: 4123 }, 3773)).toBe(4123);
    expect(resolveListeningPort("pipe", 3773)).toBe(3773);
    expect(resolveListeningPort(null, 3773)).toBe(3773);
  });
});
