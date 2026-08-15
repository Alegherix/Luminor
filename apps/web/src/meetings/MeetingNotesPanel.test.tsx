import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DISCLOSURE_WIDTH_MOTION_CLASS } from "~/lib/disclosureMotion";

import { MeetingNotesPanel } from "./MeetingNotesPanel";
import { MEETING_NOTES_PANEL_ID } from "./MeetingNotesPanel.logic";
import { MEETINGS_NOTES_MAX_CHARS } from "./meetingsNotes";

function renderPanel(props: Partial<Parameters<typeof MeetingNotesPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <MeetingNotesPanel
      open={props.open ?? true}
      notes={props.notes ?? ""}
      status={props.status ?? "idle"}
      onNotesChange={props.onNotesChange ?? (() => undefined)}
      onClose={props.onClose ?? (() => undefined)}
    />,
  );
}

function panelTag(html: string): string {
  return html.slice(0, html.indexOf(">") + 1);
}

describe("MeetingNotesPanel", () => {
  it("opens as a writing surface beside the meeting", () => {
    const html = renderPanel({ notes: "Decide on the rollout date" });

    expect(panelTag(html)).toContain(`id="${MEETING_NOTES_PANEL_ID}"`);
    expect(panelTag(html)).toContain("w-80");
    expect(panelTag(html)).not.toContain("aria-hidden");
    expect(panelTag(html)).not.toContain("inert");
    expect(html).toContain("Notes");
    expect(html).toContain("Decide on the rollout date");
    expect(html).toContain('aria-label="Meeting notes"');
    expect(html).toContain("Hide notes");
  });

  it("collapses to zero width and out of the tab order when closed", () => {
    const html = renderPanel({ open: false, notes: "Kept while collapsed" });

    expect(panelTag(html)).toContain("w-0");
    expect(panelTag(html)).toContain('aria-hidden="true"');
    expect(panelTag(html)).toContain("inert");
    expect(html).toContain("Kept while collapsed");
  });

  it("animates with the shared disclosure motion instead of a bespoke transition", () => {
    const open = renderPanel();
    const closed = renderPanel({ open: false });

    for (const html of [open, closed]) {
      for (const motionClass of DISCLOSURE_WIDTH_MOTION_CLASS.split(" ")) {
        expect(panelTag(html)).toContain(motionClass);
      }
    }
  });

  it("reports each autosave phase in a live region", () => {
    expect(renderPanel({ status: "loading" })).toContain("Loading…");
    expect(renderPanel({ status: "saving" })).toContain("Saving…");

    const saved = renderPanel({ status: "saved" });
    expect(saved).toContain("Saved");
    expect(saved).toContain('aria-live="polite"');
  });

  it("keeps the typed text visible and editable when a save fails", () => {
    const html = renderPanel({ status: "error", notes: "Unsaved decision" });

    expect(html).toContain("Unsaved decision");
    expect(html).toContain("your text is kept here");
    expect(html).toContain("text-destructive");
    expect(html).not.toContain('readonly=""');
    expect(html).toContain(`maxLength="${MEETINGS_NOTES_MAX_CHARS}"`);
  });

  it("shows the remaining characters only near the cap", () => {
    expect(renderPanel({ notes: "short" })).not.toContain("characters left");
    expect(renderPanel({ notes: "x".repeat(MEETINGS_NOTES_MAX_CHARS - 10) })).toContain(
      "10 characters left",
    );
  });
});
