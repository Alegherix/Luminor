import type { OrchestrationLatestTurn, OrchestrationSession } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { isTurnRunning, sessionStatusKind, workingStartedAt } from "./turnState";

describe("isTurnRunning", () => {
  it("is true when the session or latest turn is running", () => {
    expect(
      isTurnRunning(
        { state: "running" } as OrchestrationLatestTurn,
        {
          status: "ready",
        } as OrchestrationSession,
      ),
    ).toBe(true);
    expect(
      isTurnRunning(
        { state: "completed" } as OrchestrationLatestTurn,
        {
          status: "running",
        } as OrchestrationSession,
      ),
    ).toBe(true);
    expect(
      isTurnRunning(
        { state: "completed" } as OrchestrationLatestTurn,
        {
          status: "idle",
        } as OrchestrationSession,
      ),
    ).toBe(false);
  });
});

describe("workingStartedAt", () => {
  it("returns null when idle", () => {
    expect(
      workingStartedAt({ state: "completed", startedAt: "x" } as OrchestrationLatestTurn, null),
    ).toBeNull();
  });

  it("prefers startedAt while running", () => {
    expect(
      workingStartedAt(
        {
          state: "running",
          startedAt: "2026-08-16T11:00:00.000Z",
          requestedAt: "2026-08-16T10:59:00.000Z",
        } as OrchestrationLatestTurn,
        null,
      ),
    ).toBe("2026-08-16T11:00:00.000Z");
  });
});

describe("sessionStatusKind", () => {
  it("maps session status onto chips", () => {
    expect(sessionStatusKind("running")).toBe("running");
    expect(sessionStatusKind("starting")).toBe("active");
    expect(sessionStatusKind("error")).toBe("needs-attention");
    expect(sessionStatusKind("idle")).toBe("idle");
  });
});
