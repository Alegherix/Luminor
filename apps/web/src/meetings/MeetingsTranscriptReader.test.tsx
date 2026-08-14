import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeetingsTranscriptReader } from "./MeetingsTranscriptReader";
import {
  createIdleMeetingsWorkspace,
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
} from "./meetingsWorkspace";

const endedWorkspace = {
  ...createIdleMeetingsWorkspace(),
  connection: "signed-in" as const,
  selectedSessionId: "ended",
  sessions: [
    {
      id: "ended",
      title: "Standup",
      startAt: "2026-08-12T09:00:00.000Z",
      endAt: "2026-08-12T09:30:00.000Z",
      meetUrl: null,
      attendees: [],
      status: "ended" as const,
      source: "calendar" as const,
    },
  ],
};

describe("MeetingsTranscriptReader", () => {
  it("shows the transcript for today's ended meeting", () => {
    const html = renderToStaticMarkup(
      <MeetingsTranscriptReader
        workspace={{
          ...endedWorkspace,
          transcription: {
            status: "ready",
            sessionId: "ended",
            transcriptPath: "/tmp/luminor-home/meetings/ended/transcripts/transcript.txt",
            text: "We shipped the join path.",
            error: null,
          },
        }}
      />,
    );

    expect(html).toContain("Standup");
    expect(html).toContain("We shipped the join path.");
    expect(html).toContain("overflow-y-auto");
    expect(html).not.toContain("Transcribe");
    expect(html).not.toContain("Öppna i chatt");
    expect(html).not.toContain("Open in chat");
    expect(html).not.toContain("Back");
  });

  it("shows a Back action that returns to the join canvas", () => {
    const html = renderToStaticMarkup(
      <MeetingsTranscriptReader
        workspace={{
          ...endedWorkspace,
          transcription: {
            status: "ready",
            sessionId: "ended",
            transcriptPath: "/tmp/luminor-home/meetings/ended/transcripts/transcript.txt",
            text: "We shipped the join path.",
            error: null,
          },
        }}
        onBack={() => undefined}
      />,
    );

    expect(html).toContain("Back");
    expect(html).toContain("Standup");
  });

  it("shows the summary beside the transcript and an Öppna i chatt action", () => {
    const html = renderToStaticMarkup(
      <MeetingsTranscriptReader
        workspace={{
          ...endedWorkspace,
          transcription: {
            status: "ready",
            sessionId: "ended",
            transcriptPath: "/tmp/luminor-home/meetings/ended/transcripts/transcript.txt",
            text: "We shipped the join path.",
            error: null,
          },
          summary: {
            status: "ready",
            sessionId: "ended",
            summaryPath: "/tmp/luminor-home/meetings/ended/transcripts/summary.md",
            text: "Decision: ship the join path.",
            error: null,
          },
        }}
        onOpenInChat={() => undefined}
      />,
    );

    expect(html).toContain("Standup");
    expect(html).toContain("We shipped the join path.");
    expect(html).toContain("Decision: ship the join path.");
    expect(html).toContain("Öppna i chatt");
    expect(html).not.toContain("Open in chat");
    expect(html).not.toContain("Transcribe");
  });

  it("keeps the transcript when the summary fails", () => {
    const html = renderToStaticMarkup(
      <MeetingsTranscriptReader
        workspace={{
          ...endedWorkspace,
          transcription: {
            status: "ready",
            sessionId: "ended",
            transcriptPath: "/tmp/luminor-home/meetings/ended/transcripts/transcript.txt",
            text: "We shipped the join path.",
            error: null,
          },
          summary: {
            status: "failed",
            sessionId: "ended",
            summaryPath: null,
            text: null,
            error:
              "Text generation failed in generateMeetingSummary: Codex CLI command failed: OpenAI Codex v0.147.0 -------- workdir: /tmp user You write a silent post-meeting summary",
          },
        }}
        onOpenInChat={() => undefined}
      />,
    );

    expect(html).toContain("We shipped the join path.");
    expect(html).toContain("Codex CLI command failed");
    expect(html).not.toContain("workdir");
    expect(html).not.toContain("You write a silent");
    expect(html).toContain("Öppna i chatt");
    expect(html).toContain("overflow-y-auto");
  });

  it("shows a point-at-the-environment recovery when config is missing", () => {
    const html = renderToStaticMarkup(
      <MeetingsTranscriptReader
        workspace={{
          ...endedWorkspace,
          transcription: {
            status: "needs-environment",
            sessionId: "ended",
            transcriptPath: null,
            text: null,
            error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
          },
        }}
      />,
    );

    expect(html).toContain("Point at the transcription environment");
    expect(html).toContain("Point at the environment");
    expect(html).toContain('role="alert"');
  });
});
