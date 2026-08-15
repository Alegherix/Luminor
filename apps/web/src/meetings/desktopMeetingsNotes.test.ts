import { afterEach, describe, expect, it, vi } from "vitest";

import { desktopMeetingsNotesPersist } from "./desktopMeetingsNotes";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktopMeetingsNotesPersist", () => {
  it("writes and reads notes through the desktop meetings bridge", async () => {
    const writeNotes = vi.fn(async () => ({ notesPath: "/tmp/notes.md" }));
    const getNotes = vi.fn(async () => ({
      markdown: "## Decisions",
      notesPath: "/tmp/notes.md",
    }));
    vi.stubGlobal("desktopBridge", { meetings: { writeNotes, getNotes } });

    await desktopMeetingsNotesPersist.writeNotes("ended", "## Decisions");

    expect(writeNotes).toHaveBeenCalledWith({
      sessionId: "ended",
      markdown: "## Decisions",
    });
    await expect(desktopMeetingsNotesPersist.readNotes("ended")).resolves.toBe("## Decisions");
    expect(getNotes).toHaveBeenCalledWith({ sessionId: "ended" });
  });

  it("reports unavailable writes while treating unavailable reads as missing", async () => {
    vi.stubGlobal("desktopBridge", { meetings: {} });

    await expect(desktopMeetingsNotesPersist.writeNotes("ended", "Draft")).rejects.toThrow(
      "Notes storage is unavailable.",
    );
    await expect(desktopMeetingsNotesPersist.readNotes("ended")).resolves.toBeNull();
  });
});
