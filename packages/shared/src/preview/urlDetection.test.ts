import { describe, expect, it } from "vitest";

import { detectPreviewUrl } from "./urlDetection";

describe("detectPreviewUrl", () => {
  it.each([
    ["vite", "  ➜  Local:   http://localhost:5173/", "http://localhost:5173/"],
    ["next", "   - Local:        http://localhost:3000", "http://localhost:3000"],
    [
      "ANSI wrapped",
      "\u001b[32mhttp://localhost:4173/dashboard\u001b[39m",
      "http://localhost:4173/dashboard",
    ],
    ["IPv4 loopback", "ready at http://127.0.0.1:8080", "http://127.0.0.1:8080"],
    ["IPv6 loopback", "ready at https://[::1]:8443/app", "https://[::1]:8443/app"],
    ["wildcard IPv4", "ready at http://0.0.0.0:4321", "http://localhost:4321"],
  ])("detects a %s banner", (_name, chunk, expected) => {
    expect(detectPreviewUrl("", chunk).url).toBe(expected);
  });

  it("finds a URL split across writes", () => {
    const first = detectPreviewUrl("", "  ➜  Local: http://local");
    const second = detectPreviewUrl(first.tail, "host:5173/dashboard\n");

    expect(first.url).toBeNull();
    expect(second.url).toBe("http://localhost:5173/dashboard");
  });

  it.each([
    "Error: connect ECONNREFUSED http://localhost:5173",
    "Failed to fetch http://127.0.0.1:3000/api",
    "Exception while opening https://[::1]:8080",
  ])("ignores URLs in error output: %s", (chunk) => {
    expect(detectPreviewUrl("", chunk).url).toBeNull();
  });

  it("bounds the retained tail", () => {
    const result = detectPreviewUrl("x".repeat(10_000), "still starting");

    expect(result.tail.length).toBeLessThanOrEqual(4096);
  });
});
