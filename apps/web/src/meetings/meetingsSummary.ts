import type { ModelSelection } from "@luminor/contracts";

import { loadMeetingsNotes, type MeetingsNotesPersist } from "./meetingsNotes";
import { IDLE_MEETINGS_SUMMARY, type MeetingsSummaryHost } from "./meetingsWorkspace";

const MEETINGS_SUMMARY_ERROR_MAX_LENGTH = 240;

export type MeetingsReviewDocument = {
  readonly overview: string;
  readonly decisions: readonly string[];
  readonly actionItems: readonly string[];
};

const REVIEW_HEADING = /^##\s+(.+?)\s*$/;

function classifyReviewHeading(label: string): keyof MeetingsReviewDocument | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "overview" || normalized === "sammanfattning") {
    return "overview";
  }
  if (normalized === "decisions" || normalized === "beslut") {
    return "decisions";
  }
  if (
    normalized === "action items" ||
    normalized === "åtgärder" ||
    normalized === "åtgärdspunkter"
  ) {
    return "actionItems";
  }
  return null;
}

function parseBulletLines(body: string): readonly string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

export function parseMeetingsReviewMarkdown(text: string): MeetingsReviewDocument {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { overview: "", decisions: [], actionItems: [] };
  }

  const lines = trimmed.split(/\r?\n/);
  const sections = new Map<keyof MeetingsReviewDocument, string[]>();
  let current: keyof MeetingsReviewDocument = "overview";
  let sawHeading = false;

  for (const line of lines) {
    const heading = REVIEW_HEADING.exec(line);
    if (heading) {
      const next = classifyReviewHeading(heading[1] ?? "");
      if (next) {
        current = next;
        sawHeading = true;
        continue;
      }
    }
    const bucket = sections.get(current) ?? [];
    bucket.push(line);
    sections.set(current, bucket);
  }

  const overview = (sections.get("overview") ?? (sawHeading ? [] : lines)).join("\n").trim();
  return {
    overview,
    decisions: parseBulletLines((sections.get("decisions") ?? []).join("\n")),
    actionItems: parseBulletLines((sections.get("actionItems") ?? []).join("\n")),
  };
}

export function compactMeetingsSummaryError(error: string): string {
  const firstLine = error.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const withoutDump = firstLine.split(/\s+--------/, 1)[0]?.trim() ?? firstLine;
  if (withoutDump.length === 0) {
    return "Summary is unavailable.";
  }
  if (withoutDump.length <= MEETINGS_SUMMARY_ERROR_MAX_LENGTH) {
    return withoutDump;
  }
  return `${withoutDump.slice(0, MEETINGS_SUMMARY_ERROR_MAX_LENGTH - 3)}...`;
}

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
    notesText?: string;
    modelSelection: ModelSelection;
  }) => Promise<string>;
  readonly persist: MeetingsSummaryPersist;
  readonly notesPersist: MeetingsNotesPersist;
}): MeetingsSummaryHost {
  return {
    async summarize(request) {
      const modelSelection = input.resolveModelSelection();
      try {
        const loadedNotes = await loadMeetingsNotes(input.notesPersist, request.sessionId);
        const notesText = loadedNotes.notes.trim();
        const text = (
          await input.generate({
            title: request.title,
            transcriptText: request.transcriptText,
            ...(notesText.length > 0 ? { notesText } : {}),
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
          error:
            error instanceof Error ? compactMeetingsSummaryError(error.message) : "Summary failed.",
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
