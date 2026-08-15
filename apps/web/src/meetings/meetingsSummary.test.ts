import { describe, expect, it, vi } from "vitest";

import {
  compactMeetingsSummaryError,
  createMeetingsSummaryHost,
  parseMeetingsReviewMarkdown,
} from "./meetingsSummary";

describe("parseMeetingsReviewMarkdown", () => {
  it("splits overview, decisions, and action items from a generated review", () => {
    expect(
      parseMeetingsReviewMarkdown(
        [
          "## Overview",
          "",
          "We shipped the join path.",
          "",
          "## Decisions",
          "",
          "- Keep the embed beside notes.",
          "",
          "## Action items",
          "",
          "- File the follow-up thread.",
          "- Check the recording path.",
        ].join("\n"),
      ),
    ).toEqual({
      overview: "We shipped the join path.",
      decisions: ["Keep the embed beside notes."],
      actionItems: ["File the follow-up thread.", "Check the recording path."],
    });
  });

  it("treats unsectioned markdown as the overview", () => {
    expect(parseMeetingsReviewMarkdown("Just a paragraph.")).toEqual({
      overview: "Just a paragraph.",
      decisions: [],
      actionItems: [],
    });
  });
});

describe("createMeetingsSummaryHost", () => {
  it("summarizes with the resolved new-thread model and persists summary.md", async () => {
    const generate = vi.fn(async () => "## Decisions\n- Ship the join path.");
    const writeSummary = vi.fn(async () => ({
      summaryPath: "/tmp/luminor-home/meetings/ended/transcripts/summary.md",
    }));
    const readNotes = vi.fn(async () => "Follow up with the release team.");
    const host = createMeetingsSummaryHost({
      resolveModelSelection: () => ({ provider: "grok", model: "grok-4" }),
      generate,
      persist: {
        writeSummary,
        readSummary: async () => null,
      },
      notesPersist: {
        readNotes,
        writeNotes: async () => undefined,
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
      notesText: "Follow up with the release team.",
      modelSelection: { provider: "grok", model: "grok-4" },
    });
    expect(readNotes).toHaveBeenCalledWith("ended");
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

  it("keeps generation input unchanged when notes are absent", async () => {
    const generate = vi.fn(async () => "## Decisions\n- Ship the join path.");
    const host = createMeetingsSummaryHost({
      resolveModelSelection: () => ({ provider: "grok", model: "grok-4" }),
      generate,
      persist: {
        writeSummary: async () => ({ summaryPath: "/tmp/summary.md" }),
        readSummary: async () => null,
      },
      notesPersist: {
        readNotes: async () => null,
        writeNotes: async () => undefined,
      },
    });

    await host.summarize({
      sessionId: "ended",
      title: "Standup",
      transcriptText: "We shipped the join path.",
      transcriptPath: null,
    });

    expect(generate).toHaveBeenCalledWith({
      title: "Standup",
      transcriptText: "We shipped the join path.",
      modelSelection: { provider: "grok", model: "grok-4" },
    });
  });

  it("continues summarization without notes when reading notes fails", async () => {
    const generate = vi.fn(async () => "## Decisions\n- Ship the join path.");
    const host = createMeetingsSummaryHost({
      resolveModelSelection: () => ({ provider: "grok", model: "grok-4" }),
      generate,
      persist: {
        writeSummary: async () => ({ summaryPath: "/tmp/summary.md" }),
        readSummary: async () => null,
      },
      notesPersist: {
        readNotes: async () => {
          throw new Error("Notes unavailable.");
        },
        writeNotes: async () => undefined,
      },
    });

    const result = await host.summarize({
      sessionId: "ended",
      title: "Standup",
      transcriptText: "We shipped the join path.",
      transcriptPath: null,
    });

    expect(generate).toHaveBeenCalledWith({
      title: "Standup",
      transcriptText: "We shipped the join path.",
      modelSelection: { provider: "grok", model: "grok-4" },
    });
    expect(result.status).toBe("ready");
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
      notesPersist: {
        readNotes: async () => null,
        writeNotes: async () => undefined,
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

  it("strips dumped CLI transcripts from a failed summary error", async () => {
    const dumped =
      "Text generation failed in generateMeetingSummary: Codex CLI command failed: OpenAI Codex v0.147.0 -------- workdir: /tmp user You write a silent post-meeting summary";
    const host = createMeetingsSummaryHost({
      resolveModelSelection: () => ({ provider: "claudeAgent", model: "claude-sonnet-4-6" }),
      generate: async () => {
        throw new Error(dumped);
      },
      persist: {
        writeSummary: async () => {
          throw new Error("should not write");
        },
        readSummary: async () => null,
      },
      notesPersist: {
        readNotes: async () => null,
        writeNotes: async () => undefined,
      },
    });

    const result = await host.summarize({
      sessionId: "ended",
      title: "Standup",
      transcriptText: "We shipped the join path.",
      transcriptPath: null,
    });

    expect(result.error).toBe(compactMeetingsSummaryError(dumped));
    expect(result.error).toContain("Codex CLI command failed");
    expect(result.error).not.toContain("workdir");
    expect(result.error).not.toContain("You write a silent");
  });
});
