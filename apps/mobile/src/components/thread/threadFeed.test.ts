import type {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationSession,
  OrchestrationThreadActivity,
} from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { buildThreadFeed, latestStreamingMessageId } from "./threadFeed";

function message(
  overrides: Pick<OrchestrationMessage, "id" | "role" | "text" | "createdAt"> &
    Partial<OrchestrationMessage>,
): OrchestrationMessage {
  return {
    turnId: null,
    streaming: false,
    source: "native",
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

describe("buildThreadFeed", () => {
  it("orders mixed items and connects consecutive activities", () => {
    const items = buildThreadFeed({
      messages: [
        message({
          id: "m1" as OrchestrationMessage["id"],
          role: "user",
          text: "go",
          createdAt: "2026-08-16T12:00:00.000Z",
        }),
        message({
          id: "m2" as OrchestrationMessage["id"],
          role: "assistant",
          text: "working",
          createdAt: "2026-08-16T12:01:00.000Z",
          streaming: true,
        }),
      ],
      activities: [
        {
          id: "a1" as OrchestrationThreadActivity["id"],
          tone: "tool",
          kind: "tool.started",
          summary: "Searching codebase",
          payload: {},
          turnId: null,
          createdAt: "2026-08-16T12:00:30.000Z",
        },
        {
          id: "a2" as OrchestrationThreadActivity["id"],
          tone: "info",
          kind: "turn.tasks.updated",
          summary: "Tasks updated",
          payload: { tasks: [{ task: "Search", status: "inProgress" }] },
          turnId: null,
          createdAt: "2026-08-16T12:00:40.000Z",
        },
        {
          id: "a3" as OrchestrationThreadActivity["id"],
          tone: "info",
          kind: "task.completed",
          summary: "Tests passed",
          payload: {},
          turnId: null,
          createdAt: "2026-08-16T12:00:50.000Z",
        },
      ],
      fileEdits: [
        {
          turnId: "t1" as OrchestrationCheckpointSummary["turnId"],
          checkpointTurnCount: 1,
          checkpointRef: "cp-1" as OrchestrationCheckpointSummary["checkpointRef"],
          status: "ready",
          files: [{ path: "a.ts", kind: "modified", additions: 7, deletions: 1 }],
          assistantMessageId: null,
          completedAt: "2026-08-16T12:01:10.000Z",
        },
      ],
      taskProgress: {
        completed: 0,
        total: 1,
        at: "2026-08-16T12:00:40.000Z",
        items: [{ label: "Search", state: "current" }],
      },
      session: {
        threadId: "th1" as OrchestrationSession["threadId"],
        status: "running",
        providerName: "grok",
        runtimeMode: "auto",
        activeTurnId: null,
        lastError: null,
        updatedAt: "2026-08-16T12:01:20.000Z",
      },
    });

    expect(items.map((item) => item.type)).toEqual([
      "message",
      "activity",
      "taskProgress",
      "activity",
      "message",
      "fileEdit",
      "session",
    ]);
    const firstActivity = items.find((item) => item.type === "activity");
    const lastActivity = items.toReversed().find((item) => item.type === "activity");
    expect(firstActivity?.type === "activity" && firstActivity.connectBelow).toBe(false);
    expect(lastActivity?.type === "activity" && lastActivity.connectAbove).toBe(false);
    expect(
      items.some((item) => item.type === "activity" && item.activity.kind === "turn.tasks.updated"),
    ).toBe(false);
  });
});

describe("latestStreamingMessageId", () => {
  it("returns the newest streaming assistant message", () => {
    expect(
      latestStreamingMessageId([
        message({
          id: "m1" as OrchestrationMessage["id"],
          role: "assistant",
          text: "one",
          createdAt: "2026-08-16T12:00:00.000Z",
          streaming: true,
        }),
        message({
          id: "m2" as OrchestrationMessage["id"],
          role: "assistant",
          text: "two",
          createdAt: "2026-08-16T12:01:00.000Z",
          streaming: true,
        }),
      ]),
    ).toBe("m2");
  });
});
