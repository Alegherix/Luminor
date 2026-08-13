import { describe, expect, it, vi } from "vitest";

import { createMeetingsSummaryHost } from "./meetingsSummary";

describe("createMeetingsSummaryHost", () => {
  it("summarizes with the resolved new-thread model and persists summary.md", async () => {
    const generate = vi.fn(async () => "## Decisions\n- Ship the join path.");
    const writeSummary = vi.fn(async () => ({
      summaryPath: "/tmp/luminor-home/meetings/ended/transcripts/summary.md",
    }));
    const host = createMeetingsSummaryHost({
      resolveModelSelection: () => ({ provider: "grok", model: "grok-4" }),
      generate,
      persist: {
        writeSummary,
        readSummary: async () => null,
      },
    });

    const result = await host.summarize({
      sessionId: "ended",
      title: "Standup",
      transcriptText: "We shipped the join path.",
      transcriptPath: "/tmp/luminor-home/meetings/ended/transcripts/transcript.txt",
    });

    expect(generate).toHaveBeenCalledWith({
      title: "Standup",
      transcriptText: "We shipped the join path.",
      modelSelection: { provider: "grok", model: "grok-4" },
    });
    expect(writeSummary).toHaveBeenCalledWith({
      sessionId: "ended",
      text: "## Decisions\n- Ship the join path.",
    });
    expect(result).toEqual({
      status: "ready",
      sessionId: "ended",
      summaryPath: "/tmp/luminor-home/meetings/ended/transcripts/summary.md",
      text: "## Decisions\n- Ship the join path.",
      error: null,
    });
  });

  it("returns a failed summary without hiding the transcript when generation fails", async () => {
    const host = createMeetingsSummaryHost({
      resolveModelSelection: () => ({ provider: "claudeAgent", model: "claude-sonnet-4-6" }),
      generate: async () => {
        throw new Error("Model unavailable.");
      },
      persist: {
        writeSummary: async () => {
          throw new Error("should not write");
        },
        readSummary: async () => null,
      },
    });

    await expect(
      host.summarize({
        sessionId: "ended",
        title: "Standup",
        transcriptText: "We shipped the join path.",
        transcriptPath: null,
      }),
    ).resolves.toEqual({
      status: "failed",
      sessionId: "ended",
      summaryPath: null,
      text: null,
      error: "Model unavailable.",
    });
  });
});
