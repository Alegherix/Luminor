// FILE: CursorAdapter.test.ts
// Purpose: Characterizes Cursor's private Luminor host-policy delivery.
// Layer: Provider adapter tests

import { LUMINOR_HARNESS_POLICY_MARKER } from "../../agentGateway/harnessPolicy.ts";
import { describe, expect, it } from "vitest";

import { takeCursorLuminorHarnessPolicyTextPart } from "./CursorAdapter.ts";

describe("Cursor Luminor harness policy", () => {
  it("delivers scoped MCP host context exactly once per fresh/load/fork session", () => {
    for (const lifecycle of ["fresh", "load", "fork"] as const) {
      const state: { harnessPolicyDelivered?: boolean } = {};
      const first = takeCursorLuminorHarnessPolicyTextPart(state, true);
      expect(first?.text, lifecycle).toContain(LUMINOR_HARNESS_POLICY_MARKER);
      expect(first?.text, lifecycle).toContain("Use the luminor_* tools");
      expect(takeCursorLuminorHarnessPolicyTextPart(state, true), lifecycle).toBeNull();
    }
  });

  it("stays truthful without a scoped gateway connection", () => {
    expect(takeCursorLuminorHarnessPolicyTextPart({}, false)?.text).toContain(
      "Luminor MCP control is unavailable",
    );
  });
});
