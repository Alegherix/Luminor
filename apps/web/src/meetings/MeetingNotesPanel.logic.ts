import { MEETINGS_NOTES_MAX_CHARS, type MeetingsNotesStatus } from "./meetingsNotes";

export const MEETING_NOTES_PANEL_ID = "meeting-notes-panel";
export const MEETING_NOTES_PANEL_TITLE_ID = `${MEETING_NOTES_PANEL_ID}-title`;
export const MEETING_NOTES_COUNTER_THRESHOLD = 500;

export type MeetingNotesSaveState = {
  readonly label: string;
  readonly tone: "muted" | "destructive";
};

export function meetingNotesSaveState(status: MeetingsNotesStatus): MeetingNotesSaveState | null {
  switch (status) {
    case "loading":
      return { label: "Loading…", tone: "muted" };
    case "saving":
      return { label: "Saving…", tone: "muted" };
    case "saved":
      return { label: "Saved", tone: "muted" };
    case "error":
      return { label: "Not saved — your text is kept here", tone: "destructive" };
    case "idle":
      return null;
  }
}

export function meetingNotesRemainingLabel(notes: string): string | null {
  const remaining = Math.max(0, MEETINGS_NOTES_MAX_CHARS - notes.length);
  if (remaining > MEETING_NOTES_COUNTER_THRESHOLD) {
    return null;
  }
  return remaining === 1 ? "1 character left" : `${remaining} characters left`;
}
