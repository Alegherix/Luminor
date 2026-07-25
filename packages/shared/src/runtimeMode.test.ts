import { describe, expect, it } from "vitest";

import {
  normalizeRuntimeModeForProvider,
  providerSupportsRuntimeMode,
  supportedRuntimeModesForProvider,
} from "./runtimeMode";

describe("runtime mode compatibility", () => {
  it("limits Auto to providers with a native reviewer", () => {
    expect(providerSupportsRuntimeMode("codex", "auto")).toBe(true);
    expect(providerSupportsRuntimeMode("claudeAgent", "auto")).toBe(true);
    expect(providerSupportsRuntimeMode("opencode", "auto")).toBe(false);
    expect(providerSupportsRuntimeMode("cursor", "auto")).toBe(false);
  });

  it("keeps Antigravity full-access only without silently escalating callers", () => {
    expect(supportedRuntimeModesForProvider("antigravity")).toEqual(["full-access"]);
    expect(normalizeRuntimeModeForProvider("approval-required", "antigravity")).toBe(
      "approval-required",
    );
    expect(normalizeRuntimeModeForProvider("auto", "antigravity")).toBe("auto");
    expect(normalizeRuntimeModeForProvider("full-access", "antigravity")).toBe("full-access");
  });
});
