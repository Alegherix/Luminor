import { describe, expect, it } from "vitest";

import { runtimeModeEscalatesPrivilege } from "./runtimeModePolicy.ts";

describe("agent gateway runtime-mode privilege ordering", () => {
  it("orders supervised below auto below full access", () => {
    expect(runtimeModeEscalatesPrivilege("approval-required", "auto")).toBe(true);
    expect(runtimeModeEscalatesPrivilege("auto", "full-access")).toBe(true);
    expect(runtimeModeEscalatesPrivilege("auto", "approval-required")).toBe(false);
    expect(runtimeModeEscalatesPrivilege("full-access", "auto")).toBe(false);
  });
});
