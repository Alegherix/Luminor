import type { ModelSelection } from "@luminor/contracts";

import { IDLE_MEETINGS_SUMMARY, type MeetingsSummaryHost } from "./meetingsWorkspace";

export type MeetingsSummaryPersist = {
  writeSummary(input: { sessionId: string; text: string }): Promise<{
    readonly summaryPath: string;
  }>;
  readSummary(sessionId: string): Promise<{
    readonly text: string;
    readonly summaryPath: string;
  } | null>;
};

export function createMeetingsSummaryHost(input: {
  readonly resolveModelSelection: () => ModelSelection;
  readonly generate: (input: {
    title: string;
    transcriptText: string;
    modelSelection: ModelSelection;
  }) => Promise<string>;
  readonly persist: MeetingsSummaryPersist;
}): MeetingsSummaryHost {
  return {
    async summarize(request) {
      const modelSelection = input.resolveModelSelection();
      try {
        const text = (
          await input.generate({
            title: request.title,
            transcriptText: request.transcriptText,
            modelSelection,
          })
        ).trim();
        if (text.length === 0) {
          return {
            status: "failed",
            sessionId: request.sessionId,
            summaryPath: null,
            text: null,
            error: "Summary is empty.",
          };
        }
        const written = await input.persist.writeSummary({
          sessionId: request.sessionId,
          text,
        });
        return {
          status: "ready",
          sessionId: request.sessionId,
          summaryPath: written.summaryPath,
          text,
          error: null,
        };
      } catch (error) {
        return {
          status: "failed",
          sessionId: request.sessionId,
          summaryPath: null,
          text: null,
          error: error instanceof Error ? error.message : "Summary failed.",
        };
      }
    },
    async getSummary(sessionId) {
      try {
        const stored = await input.persist.readSummary(sessionId);
        if (!stored) {
          return {
            ...IDLE_MEETINGS_SUMMARY,
            sessionId,
          };
        }
        return {
          status: "ready",
          sessionId,
          summaryPath: stored.summaryPath,
          text: stored.text,
          error: null,
        };
      } catch {
        return {
          ...IDLE_MEETINGS_SUMMARY,
          sessionId,
        };
      }
    },
  };
}
