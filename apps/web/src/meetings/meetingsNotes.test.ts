import { describe, expect, it, vi } from "vitest";

import {
  clampMeetingsNotes,
  createLocalStorageMeetingsNotesPersist,
  loadMeetingsNotes,
  MEETINGS_NOTES_MAX_CHARS,
  saveMeetingsNotes,
} from "./meetingsNotes";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("meeting notes", () => {
  it("caps notes at the ThreadNotes character limit", () => {
    const markdown = "n".repeat(MEETINGS_NOTES_MAX_CHARS + 12);

    expect(clampMeetingsNotes(markdown)).toHaveLength(MEETINGS_NOTES_MAX_CHARS);
  });

  it("loads persisted notes and treats a missing note as idle", async () => {
    const readNotes = vi
      .fn<(sessionId: string) => Promise<string | null>>()
      .mockResolvedValueOnce("## Decisions")
      .mockResolvedValueOnce(null);
    const persist = { readNotes, writeNotes: vi.fn() };

    await expect(loadMeetingsNotes(persist, "ready")).resolves.toEqual({
      notes: "## Decisions",
      status: "saved",
    });
    await expect(loadMeetingsNotes(persist, "missing")).resolves.toEqual({
      notes: "",
      status: "idle",
    });
  });

  it("surfaces read failures without throwing", async () => {
    const persist = {
      readNotes: async () => {
        throw new Error("storage unavailable");
      },
      writeNotes: vi.fn(),
    };

    await expect(loadMeetingsNotes(persist, "ended")).resolves.toEqual({
      notes: "",
      status: "error",
    });
  });

  it("preserves typed text in the result when a write fails", async () => {
    const markdown = "n".repeat(MEETINGS_NOTES_MAX_CHARS + 12);
    const writeNotes = vi.fn(async () => {
      throw new Error("disk full");
    });

    const result = await saveMeetingsNotes(
      { readNotes: async () => null, writeNotes },
      "ended",
      markdown,
    );

    expect(writeNotes).toHaveBeenCalledWith("ended", clampMeetingsNotes(markdown));
    expect(result).toEqual({
      notes: clampMeetingsNotes(markdown),
      status: "error",
    });
  });

  it("persists browser notes independently per meeting session", async () => {
    const persist = createLocalStorageMeetingsNotesPersist(createMemoryStorage());

    await persist.writeNotes("session/a", "First");
    await persist.writeNotes("session b", "Second");

    await expect(persist.readNotes("session/a")).resolves.toBe("First");
    await expect(persist.readNotes("session b")).resolves.toBe("Second");
    await expect(persist.readNotes("missing")).resolves.toBeNull();
  });
});
