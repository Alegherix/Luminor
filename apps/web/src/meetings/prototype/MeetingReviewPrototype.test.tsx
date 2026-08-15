import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MeetingNotesTab,
  prototypeNotesSessionId,
  resolvePrototypeNotesDraft,
} from "./MeetingReviewPrototype";
import { PROTOTYPE_MEETINGS, type PrototypeMeeting } from "./scenarios";

function prototypeMeeting(id: string): PrototypeMeeting {
  const meeting = PROTOTYPE_MEETINGS.find((candidate) => candidate.id === id);
  if (!meeting) {
    throw new Error(`Unknown prototype meeting: ${id}`);
  }
  return meeting;
}

describe("prototypeNotesSessionId", () => {
  it("namespaces mock meetings away from real meeting sessions", () => {
    expect(prototypeNotesSessionId("orion-kickoff")).toBe("prototype:orion-kickoff");
  });
});

describe("resolvePrototypeNotesDraft", () => {
  it("falls back to the scenario notes when nothing is persisted yet", () => {
    expect(
      resolvePrototypeNotesDraft({
        status: "idle",
        notes: "",
        scenarioNotes: "Mock-anteckning",
        edited: false,
      }),
    ).toBe("Mock-anteckning");
  });

  it("prefers persisted notes over the scenario notes", () => {
    expect(
      resolvePrototypeNotesDraft({
        status: "saved",
        notes: "Sparad anteckning",
        scenarioNotes: "Mock-anteckning",
        edited: false,
      }),
    ).toBe("Sparad anteckning");
  });

  it("keeps a persisted empty note empty instead of resurrecting the mock", () => {
    expect(
      resolvePrototypeNotesDraft({
        status: "saved",
        notes: "",
        scenarioNotes: "Mock-anteckning",
        edited: false,
      }),
    ).toBe("");
  });

  it("never overrides what the user is typing", () => {
    expect(
      resolvePrototypeNotesDraft({
        status: "saving",
        notes: "",
        scenarioNotes: "Mock-anteckning",
        edited: true,
      }),
    ).toBe("");
  });

  it("stays empty while the persisted notes are still loading", () => {
    expect(
      resolvePrototypeNotesDraft({
        status: "loading",
        notes: "",
        scenarioNotes: "Mock-anteckning",
        edited: false,
      }),
    ).toBe("");
  });

  it("treats a meeting without scenario notes as empty", () => {
    expect(
      resolvePrototypeNotesDraft({
        status: "idle",
        notes: "",
        scenarioNotes: null,
        edited: false,
      }),
    ).toBe("");
  });
});

describe("MeetingNotesTab", () => {
  it("renders the notes as an editable field instead of static text", () => {
    const html = renderToStaticMarkup(
      <MeetingNotesTab meeting={prototypeMeeting("orion-kickoff")} />,
    );

    expect(html).toContain('aria-label="Anteckningar"');
    expect(html).toContain("<textarea");
    expect(html).toContain("Inga anteckningar än");
  });

  it("offers an editable empty state for a meeting without notes", () => {
    const html = renderToStaticMarkup(
      <MeetingNotesTab meeting={prototypeMeeting("retro-sprint-24")} />,
    );

    expect(html).toContain("<textarea");
    expect(html).toContain("Inga anteckningar än");
    expect(html).not.toContain("Inga anteckningar gjordes under mötet.");
  });
});
