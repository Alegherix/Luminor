import type { DesktopBridge, ModelSelection } from "@luminor/contracts";

import { readPersistedDefaultProvider } from "../appSettings";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { desktopMeetingsNotesPersist } from "./desktopMeetingsNotes";
import { createMeetingsSummaryHost, type MeetingsSummaryPersist } from "./meetingsSummary";
import { resolveNewThreadDefaultModelSelection } from "./meetingsSummaryModel";
import type { MeetingsSummaryHost } from "./meetingsWorkspace";

const MEETING_SUMMARY_CONTEXT_MAX_CHARS = 200_000;

export function buildMeetingSummaryContext(input: {
  readonly transcriptText: string;
  readonly notesText?: string;
}): string {
  const notes = input.notesText?.trim() ?? "";
  if (notes.length === 0) {
    return input.transcriptText.slice(0, MEETING_SUMMARY_CONTEXT_MAX_CHARS);
  }
  const notesSection = `\n\n## Meeting notes\n\n${notes}`;
  const transcriptLimit = Math.max(0, MEETING_SUMMARY_CONTEXT_MAX_CHARS - notesSection.length);
  return `${input.transcriptText.slice(0, transcriptLimit)}${notesSection}`.slice(
    0,
    MEETING_SUMMARY_CONTEXT_MAX_CHARS,
  );
}

function desktopMeetings() {
  const desktopBridge = (globalThis as typeof globalThis & { desktopBridge?: DesktopBridge })
    .desktopBridge;
  return desktopBridge?.meetings;
}

function resolveSummaryCwd(): string {
  const cwd = useStore.getState().projects[0]?.cwd?.trim();
  return cwd && cwd.length > 0 ? cwd : "/";
}

function resolveSummaryModelSelection(): ModelSelection {
  const project = useStore.getState().projects[0] ?? null;
  return resolveNewThreadDefaultModelSelection({
    projectDefaultModelSelection: project?.defaultModelSelection ?? null,
    defaultProvider: readPersistedDefaultProvider(),
  });
}

const desktopPersist: MeetingsSummaryPersist = {
  async writeSummary(input) {
    const meetings = desktopMeetings();
    if (!meetings?.writeSummary) {
      throw new Error("Summary storage is unavailable.");
    }
    return meetings.writeSummary(input);
  },
  async readSummary(sessionId) {
    const meetings = desktopMeetings();
    if (!meetings?.getSummary) {
      return null;
    }
    return meetings.getSummary({ sessionId });
  },
};

export function createDesktopMeetingsSummaryHost(): MeetingsSummaryHost {
  return createMeetingsSummaryHost({
    resolveModelSelection: resolveSummaryModelSelection,
    generate: async ({ title, transcriptText, notesText, modelSelection }) => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Luminor is not connected.");
      }
      const result = await api.server.generateMeetingSummary({
        cwd: resolveSummaryCwd(),
        title: title.trim() || "Meeting",
        transcript: buildMeetingSummaryContext(
          notesText === undefined ? { transcriptText } : { transcriptText, notesText },
        ),
        textGenerationModelSelection: modelSelection,
      });
      return result.summary;
    },
    persist: desktopPersist,
    notesPersist: desktopMeetingsNotesPersist,
  });
}
