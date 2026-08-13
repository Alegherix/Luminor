import { describe, expect, it, vi } from "vitest";

import { createDesktopMeetingsTranscriptionHost } from "./desktopMeetingsTranscription";
import { MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY } from "./meetingsWorkspace";

describe("createDesktopMeetingsTranscriptionHost", () => {
  it("forwards leave-time transcription to the desktop meetings bridge", async () => {
    const transcribeRecording = vi.fn(async () => ({
      status: "ready" as const,
      sessionId: "pasted:abc-defg-hij",
      transcriptPath: "/tmp/luminor-home/meetings/pasted_abc-defg-hij/transcripts/transcript.txt",
      text: "Hello from the meeting.",
      error: null,
    }));
    vi.stubGlobal("desktopBridge", {
      meetings: { transcribeRecording },
    });

    const host = createDesktopMeetingsTranscriptionHost();
    const result = await host.transcribe({
      sessionId: "pasted:abc-defg-hij",
      recordingPath: "/tmp/luminor-home/meetings/pasted_abc-defg-hij/recordings/tape.webm",
    });

    expect(transcribeRecording).toHaveBeenCalledWith({
      sessionId: "pasted:abc-defg-hij",
      recordingPath: "/tmp/luminor-home/meetings/pasted_abc-defg-hij/recordings/tape.webm",
    });
    expect(result.status).toBe("ready");
    expect(result.text).toBe("Hello from the meeting.");
    vi.unstubAllGlobals();
  });

  it("surfaces environment recovery when the desktop bridge is missing", async () => {
    vi.stubGlobal("desktopBridge", {});
    const host = createDesktopMeetingsTranscriptionHost();
    await expect(
      host.transcribe({ sessionId: "ended", recordingPath: "/tmp/tape.webm" }),
    ).resolves.toMatchObject({
      status: "needs-environment",
      error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
    });
    vi.unstubAllGlobals();
  });
});
