import { describe, expect, it } from "vitest";

import {
  MEETING_NOTES_COUNTER_THRESHOLD,
  meetingNotesRemainingLabel,
  meetingNotesSaveState,
} from "./MeetingNotesPanel.logic";
import { MEETINGS_NOTES_MAX_CHARS } from "./meetingsNotes";

describe("meetingNotesSaveState", () => {
  it("stays silent while nothing has been typed or saved", () => {
    expect(meetingNotesSaveState("idle")).toBeNull();
  });

  it("names each autosave phase", () => {
    expect(meetingNotesSaveState("loading")?.label).toBe("Loading…");
    expect(meetingNotesSaveState("saving")?.label).toBe("Saving…");
    expect(meetingNotesSaveState("saved")?.label).toBe("Saved");
  });

  it("promises the typed text is kept when a save fails", () => {
    const state = meetingNotesSaveState("error");

    expect(state?.tone).toBe("destructive");
    expect(state?.label).toContain("your text is kept here");
  });
});

describe("meetingNotesRemainingLabel", () => {
  it("hides the counter until the cap is close", () => {
    expect(meetingNotesRemainingLabel("")).toBeNull();
    expect(
      meetingNotesRemainingLabel(
        "x".repeat(MEETINGS_NOTES_MAX_CHARS - MEETING_NOTES_COUNTER_THRESHOLD - 1),
      ),
    ).toBeNull();
  });

  it("counts down once the cap is close", () => {
    expect(
      meetingNotesRemainingLabel(
        "x".repeat(MEETINGS_NOTES_MAX_CHARS - MEETING_NOTES_COUNTER_THRESHOLD),
      ),
    ).toBe(`${MEETING_NOTES_COUNTER_THRESHOLD} characters left`);
    expect(meetingNotesRemainingLabel("x".repeat(MEETINGS_NOTES_MAX_CHARS - 1))).toBe(
      "1 character left",
    );
    expect(meetingNotesRemainingLabel("x".repeat(MEETINGS_NOTES_MAX_CHARS))).toBe(
      "0 characters left",
    );
  });
});
