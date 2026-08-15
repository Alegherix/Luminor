import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MeetingNotesEditor,
  meetingNotesCounterLabel,
  meetingNotesStatusLabel,
} from "./MeetingNotesEditor";
import { MEETINGS_NOTES_MAX_CHARS } from "./meetingsNotes";

describe("meetingNotesStatusLabel", () => {
  it("stays silent while idle and names every other save state", () => {
    expect(meetingNotesStatusLabel("idle")).toBeNull();
    expect(meetingNotesStatusLabel("loading")).toContain("Laddar");
    expect(meetingNotesStatusLabel("saving")).toBe("Sparar…");
    expect(meetingNotesStatusLabel("saved")).toBe("Sparat");
    expect(meetingNotesStatusLabel("error")).toContain("texten finns kvar");
  });
});

describe("meetingNotesCounterLabel", () => {
  it("appears only when the note approaches the cap", () => {
    expect(meetingNotesCounterLabel(0)).toBeNull();
    expect(meetingNotesCounterLabel(1_000)).toBeNull();
    expect(meetingNotesCounterLabel(MEETINGS_NOTES_MAX_CHARS)).toBe(
      `${MEETINGS_NOTES_MAX_CHARS} / ${MEETINGS_NOTES_MAX_CHARS}`,
    );
  });
});

describe("MeetingNotesEditor", () => {
  it("renders the persisted notes in an editable field", () => {
    const html = renderToStaticMarkup(
      <MeetingNotesEditor
        notes="Följ upp med Marcus om tidsplanen."
        status="saved"
        onNotesChange={() => undefined}
      />,
    );

    expect(html).toContain("<textarea");
    expect(html).toContain("Följ upp med Marcus om tidsplanen.");
    expect(html).toContain(`maxLength="${MEETINGS_NOTES_MAX_CHARS}"`);
    expect(html).toContain("Sparat");
  });

  it("shows the caller's empty state as the field placeholder", () => {
    const html = renderToStaticMarkup(
      <MeetingNotesEditor
        notes=""
        status="idle"
        onNotesChange={() => undefined}
        placeholder="Inga anteckningar än — skriv här."
      />,
    );

    expect(html).toContain("Inga anteckningar än — skriv här.");
    expect(html).not.toContain("Sparat");
    expect(html).not.toContain("Sparar…");
  });

  it("keeps the typed text visible when the save failed", () => {
    const html = renderToStaticMarkup(
      <MeetingNotesEditor
        notes="Text som inte hann sparas."
        status="error"
        onNotesChange={() => undefined}
      />,
    );

    expect(html).toContain("Text som inte hann sparas.");
    expect(html).toContain("Kunde inte spara");
    expect(html).toContain("text-destructive");
    expect(html).toContain('aria-live="polite"');
  });

  it("surfaces the character counter close to the cap", () => {
    const notes = "x".repeat(MEETINGS_NOTES_MAX_CHARS);
    const html = renderToStaticMarkup(
      <MeetingNotesEditor notes={notes} status="saving" onNotesChange={() => undefined} />,
    );

    expect(html).toContain(`${MEETINGS_NOTES_MAX_CHARS} / ${MEETINGS_NOTES_MAX_CHARS}`);
    expect(html).toContain("Sparar…");
  });
});
