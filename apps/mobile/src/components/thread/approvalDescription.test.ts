import type { OrchestrationPendingInteraction, OrchestrationThreadActivity } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { describeApproval, openApprovals } from "./approvalDescription";

describe("describeApproval", () => {
  it("uses the matching approval.requested activity", () => {
    const interaction = {
      interactionKind: "approval",
      requestId: "req-1",
      threadId: "th-1",
      turnId: null,
      lifecycleGeneration: "g1",
      status: "pending",
      decision: null,
      responseCommandId: null,
      responseRequestedAt: null,
      createdAt: "2026-08-16T12:00:00.000Z",
      resolvedAt: null,
    } as OrchestrationPendingInteraction;
    expect(
      describeApproval(interaction, [
        {
          id: "a1" as OrchestrationThreadActivity["id"],
          tone: "approval",
          kind: "approval.requested",
          summary: "Command approval requested",
          payload: { requestId: "req-1", detail: "pwd" },
          turnId: null,
          createdAt: "2026-08-16T12:00:00.000Z",
        },
      ]),
    ).toEqual({ title: "Command approval requested", body: "pwd" });
  });
});

describe("openApprovals", () => {
  it("keeps only approval interactions", () => {
    expect(
      openApprovals([
        { interactionKind: "approval" } as OrchestrationPendingInteraction,
        { interactionKind: "userInput" } as OrchestrationPendingInteraction,
      ]),
    ).toHaveLength(1);
  });
});
