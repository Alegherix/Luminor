import type { DesktopBridge } from "@luminor/contracts";

import type { MeetingsNotesPersist } from "./meetingsNotes";

function desktopMeetings() {
  const desktopBridge = (globalThis as typeof globalThis & { desktopBridge?: DesktopBridge })
    .desktopBridge;
  return desktopBridge?.meetings;
}

export const desktopMeetingsNotesPersist: MeetingsNotesPersist = {
  async writeNotes(sessionId, markdown) {
    const meetings = desktopMeetings();
    if (!meetings?.writeNotes) {
      throw new Error("Notes storage is unavailable.");
    }
    await meetings.writeNotes({ sessionId, markdown });
  },
  async readNotes(sessionId) {
    const meetings = desktopMeetings();
    if (!meetings?.getNotes) {
      return null;
    }
    return (await meetings.getNotes({ sessionId }))?.markdown ?? null;
  },
};
