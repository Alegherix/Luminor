import type { DesktopBridge, ModelSelection } from "@luminor/contracts";

import { readPersistedDefaultProvider } from "../appSettings";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { createMeetingsSummaryHost, type MeetingsSummaryPersist } from "./meetingsSummary";
import { resolveNewThreadDefaultModelSelection } from "./meetingsSummaryModel";
import type { MeetingsSummaryHost } from "./meetingsWorkspace";

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
    generate: async ({ title, transcriptText, modelSelection }) => {
      const api = readNativeApi();
      if (!api) {
        throw new Error("Luminor is not connected.");
      }
      const result = await api.server.generateMeetingSummary({
        cwd: resolveSummaryCwd(),
        title: title.trim() || "Meeting",
        transcript: transcriptText.slice(0, 200_000),
        textGenerationModelSelection: modelSelection,
      });
      return result.summary;
    },
    persist: desktopPersist,
  });
}
