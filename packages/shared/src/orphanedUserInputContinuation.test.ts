import { describe, expect, it } from "vitest";

import {
  formatOrphanedUserInputContinuation,
  isOrphanedUserInputDeliveryFailure,
  shouldContinueOrphanedUserInputAsTurn,
} from "./orphanedUserInputContinuation";

describe("isOrphanedUserInputDeliveryFailure", () => {
  it("detects a missing persisted provider binding", () => {
    expect(
      isOrphanedUserInputDeliveryFailure(
        "Cannot route thread 'thread-1' because no persisted provider binding exists.",
      ),
    ).toBe(true);
  });

  it("detects a missing or stopped provider session", () => {
    expect(
      isOrphanedUserInputDeliveryFailure("No provider session thread is bound to this thread."),
    ).toBe(true);
    expect(
      isOrphanedUserInputDeliveryFailure("No active provider session is bound to this thread."),
    ).toBe(true);
  });

  it("does not treat a recoverable AskUserQuestion failure as orphaned", () => {
    expect(
      isOrphanedUserInputDeliveryFailure(
        "API Error: 400 input_length and max_tokens exceed context limit; prompt is too long.",
      ),
    ).toBe(false);
    expect(
      isOrphanedUserInputDeliveryFailure(
        "Stale pending user-input request: req-1. Provider callback state does not survive app restarts or recovered sessions.",
      ),
    ).toBe(false);
  });
});

describe("shouldContinueOrphanedUserInputAsTurn", () => {
  it("continues when the projected session can no longer receive a tool result", () => {
    expect(shouldContinueOrphanedUserInputAsTurn({ sessionStatus: "interrupted" })).toBe(true);
    expect(shouldContinueOrphanedUserInputAsTurn({ sessionStatus: "stopped" })).toBe(true);
    expect(shouldContinueOrphanedUserInputAsTurn({ sessionStatus: "error" })).toBe(true);
  });

  it("continues a running session only when the provider binding itself is gone", () => {
    expect(
      shouldContinueOrphanedUserInputAsTurn({
        sessionStatus: "running",
        failureDetail:
          "Cannot route thread 'thread-1' because no persisted provider binding exists.",
      }),
    ).toBe(true);
    expect(
      shouldContinueOrphanedUserInputAsTurn({
        sessionStatus: "running",
        failureDetail: "Unknown pending user-input request: req-1",
      }),
    ).toBe(false);
  });

  it("does not continue a live session after a transient AskUserQuestion rejection", () => {
    expect(
      shouldContinueOrphanedUserInputAsTurn({
        sessionStatus: "running",
        failureDetail:
          "API Error: 400 input_length and max_tokens exceed context limit; prompt is too long.",
      }),
    ).toBe(false);
  });
});

describe("formatOrphanedUserInputContinuation", () => {
  it("renders selected answers as a continuation user message", () => {
    expect(
      formatOrphanedUserInputContinuation({
        questions: [
          {
            id: "license",
            header: "License",
            question: "Which license should the project use?",
          },
          {
            id: "shell",
            header: "Shell",
            question: "Which shell architecture?",
          },
        ],
        answers: {
          license: "MIT / Apache",
          shell: ["QueueRail", "PeekDock"],
        },
      }),
    ).toBe(
      [
        "The previous turn asked for input, but that session is no longer running. Continue with these answers:",
        "",
        "- License: MIT / Apache",
        "- Shell: QueueRail, PeekDock",
      ].join("\n"),
    );
  });

  it("falls back to answer ids when the original questions are gone", () => {
    expect(
      formatOrphanedUserInputContinuation({
        answers: {
          sandbox_mode: "workspace-write",
        },
      }),
    ).toContain("- sandbox_mode: workspace-write");
  });
});
