import type { OrchestrationThreadActivity } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { presentActivity } from "./activityPresentation";

describe("presentActivity", () => {
  it("maps success, tool, and approval tones", () => {
    expect(
      presentActivity({
        id: "1" as OrchestrationThreadActivity["id"],
        tone: "info",
        kind: "task.completed",
        summary: "Tests passed",
        payload: { detail: "12 passed" },
        turnId: null,
        createdAt: "2026-08-16T12:00:00.000Z",
      }),
    ).toMatchObject({ title: "Tests passed", body: "12 passed", icon: "success", success: true });

    expect(
      presentActivity({
        id: "2" as OrchestrationThreadActivity["id"],
        tone: "tool",
        kind: "tool.started",
        summary: "Searching codebase",
        payload: { path: "apps/mobile" },
        turnId: null,
        createdAt: "2026-08-16T12:00:00.000Z",
      }),
    ).toMatchObject({ icon: "tool", body: "apps/mobile" });

    expect(
      presentActivity({
        id: "3" as OrchestrationThreadActivity["id"],
        tone: "approval",
        kind: "approval.requested",
        summary: "Command approval requested",
        payload: { detail: "pwd" },
        turnId: null,
        createdAt: "2026-08-16T12:00:00.000Z",
      }),
    ).toMatchObject({ icon: "approval", body: "pwd" });
  });
});
