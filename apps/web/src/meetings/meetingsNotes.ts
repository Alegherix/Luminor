export const MEETINGS_NOTES_MAX_CHARS = 16_384;

export type MeetingsNotesStatus = "idle" | "loading" | "saving" | "saved" | "error";

export type MeetingsNotesPersist = {
  readNotes(sessionId: string): Promise<string | null>;
  writeNotes(sessionId: string, markdown: string): Promise<void>;
};

export type MeetingsNotesLoadResult = {
  readonly notes: string;
  readonly status: "idle" | "saved" | "error";
};

export type MeetingsNotesSaveResult = {
  readonly notes: string;
  readonly status: "saved" | "error";
};

type MeetingsNotesStorage = Pick<Storage, "getItem" | "setItem">;

const MEETINGS_NOTES_STORAGE_PREFIX = "luminor:meetings-notes:v1:";

export function clampMeetingsNotes(markdown: string): string {
  return markdown.slice(0, MEETINGS_NOTES_MAX_CHARS);
}

export async function loadMeetingsNotes(
  persist: MeetingsNotesPersist,
  sessionId: string,
): Promise<MeetingsNotesLoadResult> {
  try {
    const stored = await persist.readNotes(sessionId);
    if (stored === null) {
      return { notes: "", status: "idle" };
    }
    return { notes: clampMeetingsNotes(stored), status: "saved" };
  } catch {
    return { notes: "", status: "error" };
  }
}

export async function saveMeetingsNotes(
  persist: MeetingsNotesPersist,
  sessionId: string,
  markdown: string,
): Promise<MeetingsNotesSaveResult> {
  const notes = clampMeetingsNotes(markdown);
  try {
    await persist.writeNotes(sessionId, notes);
    return { notes, status: "saved" };
  } catch {
    return { notes, status: "error" };
  }
}

export function createLocalStorageMeetingsNotesPersist(
  storage?: MeetingsNotesStorage,
): MeetingsNotesPersist {
  const resolveStorage = () => storage ?? globalThis.localStorage;
  const keyFor = (sessionId: string) =>
    `${MEETINGS_NOTES_STORAGE_PREFIX}${encodeURIComponent(sessionId)}`;

  return {
    async readNotes(sessionId) {
      return resolveStorage().getItem(keyFor(sessionId));
    },
    async writeNotes(sessionId, markdown) {
      resolveStorage().setItem(keyFor(sessionId), markdown);
    },
  };
}
