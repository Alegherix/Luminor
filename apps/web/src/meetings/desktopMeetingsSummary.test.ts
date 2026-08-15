import { describe, expect, it } from "vitest";

import { buildMeetingSummaryContext, resolveSummaryCwd } from "./desktopMeetingsSummary";

describe("buildMeetingSummaryContext", () => {
  it("keeps the transcript unchanged when notes are absent", () => {
    expect(
      buildMeetingSummaryContext({
        transcriptText: "We shipped the join path.",
      }),
    ).toBe("We shipped the join path.");
  });

  it("appends notes as a distinct context section", () => {
    expect(
      buildMeetingSummaryContext({
        transcriptText: "We shipped the join path.",
        notesText: "Follow up with the release team.",
      }),
    ).toBe("We shipped the join path.\n\n## Meeting notes\n\nFollow up with the release team.");
  });

  it("preserves bounded notes when the transcript reaches the request limit", () => {
    const result = buildMeetingSummaryContext({
      transcriptText: "t".repeat(200_000),
      notesText: "Keep this note.",
    });

    expect(result).toHaveLength(200_000);
    expect(result.endsWith("## Meeting notes\n\nKeep this note.")).toBe(true);
  });
});

describe("resolveSummaryCwd", () => {
  it("prefers the project workspace, then the Luminor home, and never uses /", () => {
    expect(resolveSummaryCwd({ projectCwd: "/repo", homeDir: "/home/me/.luminor" })).toBe("/repo");
    expect(resolveSummaryCwd({ projectCwd: "  ", homeDir: "/home/me/.luminor" })).toBe(
      "/home/me/.luminor",
    );
    expect(resolveSummaryCwd({ projectCwd: null, homeDir: null })).toBe("/tmp");
  });
});
