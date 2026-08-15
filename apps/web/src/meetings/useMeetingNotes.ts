import { useCallback, useEffect, useRef, useState } from "react";

import { isElectron } from "../env";
import { useDebouncedAutosave } from "../hooks/useDebouncedAutosave";
import { desktopMeetingsNotesPersist } from "./desktopMeetingsNotes";
import {
  clampMeetingsNotes,
  createLocalStorageMeetingsNotesPersist,
  loadMeetingsNotes,
  saveMeetingsNotes,
  type MeetingsNotesPersist,
  type MeetingsNotesStatus,
} from "./meetingsNotes";

type PendingMeetingNotes = {
  readonly sessionId: string;
  readonly notes: string;
};

const browserMeetingsNotesPersist = createLocalStorageMeetingsNotesPersist();
const meetingsNotesPersist: MeetingsNotesPersist = isElectron
  ? desktopMeetingsNotesPersist
  : browserMeetingsNotesPersist;

function samePendingMeetingNotes(left: PendingMeetingNotes, right: PendingMeetingNotes): boolean {
  return left.sessionId === right.sessionId && left.notes === right.notes;
}

export function useMeetingNotes(sessionId: string): {
  readonly notes: string;
  readonly setNotes: (notes: string) => void;
  readonly status: MeetingsNotesStatus;
} {
  const [notes, setNotesState] = useState("");
  const [loadStatus, setLoadStatus] = useState<MeetingsNotesStatus | null>("loading");
  const editVersionRef = useRef(0);
  const {
    schedule,
    flush,
    reset,
    status: autosaveStatus,
  } = useDebouncedAutosave<PendingMeetingNotes>({
    initialValue: { sessionId, notes: "" },
    equals: samePendingMeetingNotes,
    save: async (pending) => {
      const result = await saveMeetingsNotes(
        meetingsNotesPersist,
        pending.sessionId,
        pending.notes,
      );
      if (result.status === "error") {
        throw new Error("Meeting notes could not be saved.");
      }
    },
  });

  useEffect(() => {
    let cancelled = false;
    const loadVersion = editVersionRef.current;
    setNotesState("");
    setLoadStatus("loading");
    reset({ sessionId, notes: "" });
    void loadMeetingsNotes(meetingsNotesPersist, sessionId).then((result) => {
      if (cancelled || editVersionRef.current !== loadVersion) return;
      setNotesState(result.notes);
      reset({ sessionId, notes: result.notes });
      setLoadStatus(result.status);
    });
    return () => {
      cancelled = true;
      void flush().catch(() => undefined);
    };
  }, [flush, reset, sessionId]);

  const setNotes = useCallback(
    (markdown: string) => {
      const nextNotes = clampMeetingsNotes(markdown);
      editVersionRef.current += 1;
      setNotesState(nextNotes);
      setLoadStatus(null);
      schedule({ sessionId, notes: nextNotes });
    },
    [schedule, sessionId],
  );

  return {
    notes,
    setNotes,
    status: loadStatus ?? autosaveStatus,
  };
}
