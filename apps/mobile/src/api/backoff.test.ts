import { describe, expect, it } from "vitest";

import {
  getReconnectRetryDelayMs,
  INITIAL_RECONNECT_RETRY_MS,
  MAX_RECONNECT_RETRY_MS,
} from "./backoff";

describe("getReconnectRetryDelayMs", () => {
  it("starts at 500ms and doubles until the 5000ms cap", () => {
    expect(getReconnectRetryDelayMs(0)).toBe(INITIAL_RECONNECT_RETRY_MS);
    expect(getReconnectRetryDelayMs(1)).toBe(1_000);
    expect(getReconnectRetryDelayMs(2)).toBe(2_000);
    expect(getReconnectRetryDelayMs(3)).toBe(4_000);
    expect(getReconnectRetryDelayMs(4)).toBe(MAX_RECONNECT_RETRY_MS);
    expect(getReconnectRetryDelayMs(8)).toBe(MAX_RECONNECT_RETRY_MS);
  });

  it("clamps negative and fractional attempts and caps the exponent at 16", () => {
    expect(getReconnectRetryDelayMs(-3)).toBe(INITIAL_RECONNECT_RETRY_MS);
    expect(getReconnectRetryDelayMs(1.9)).toBe(1_000);
    expect(getReconnectRetryDelayMs(16)).toBe(MAX_RECONNECT_RETRY_MS);
    expect(getReconnectRetryDelayMs(32)).toBe(MAX_RECONNECT_RETRY_MS);
  });
});
