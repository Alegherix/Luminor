import type { DesktopBridge } from "@luminor/contracts";

import {
  IDLE_MEETINGS_TRANSCRIPTION,
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
  type MeetingsTranscriptionHost,
  type MeetingsTranscriptionState,
} from "./meetingsWorkspace";

function desktopMeetings() {
  const desktopBridge = (globalThis as typeof globalThis & { desktopBridge?: DesktopBridge })
    .desktopBridge;
  return desktopBridge?.meetings;
}

function toWorkspaceState(
  state: MeetingsTranscriptionState | null | undefined,
): MeetingsTranscriptionState {
  if (!state) {
    return IDLE_MEETINGS_TRANSCRIPTION;
  }
  return {
    status: state.status,
    sessionId: state.sessionId,
    transcriptPath: state.transcriptPath,
    text: state.text,
    error: state.error,
  };
}

export function createDesktopMeetingsTranscriptionHost(): MeetingsTranscriptionHost {
  return {
    async transcribe(input) {
      const meetings = desktopMeetings();
      if (!meetings?.transcribeRecording) {
        return {
          status: "needs-environment",
          sessionId: input.sessionId,
          transcriptPath: null,
          text: null,
          error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
        };
      }
      return toWorkspaceState(await meetings.transcribeRecording(input));
    },
    async getTranscript(sessionId) {
      const meetings = desktopMeetings();
      if (!meetings?.getTranscript) {
        return IDLE_MEETINGS_TRANSCRIPTION;
      }
      return toWorkspaceState(await meetings.getTranscript({ sessionId }));
    },
    async pointAtEnvironment() {
      const meetings = desktopMeetings();
      if (!meetings?.pointAtTranscriptionEnvironment) {
        return {
          status: "needs-environment",
          error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
        };
      }
      return meetings.pointAtTranscriptionEnvironment();
    },
  };
}
