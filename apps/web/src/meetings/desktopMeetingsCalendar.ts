import type { DesktopBridge } from "@luminor/contracts";

import type { MeetingsCalendarHost } from "./meetingsWorkspace";

function desktopMeetings() {
  const desktopBridge = (globalThis as typeof globalThis & { desktopBridge?: DesktopBridge })
    .desktopBridge;
  return desktopBridge?.meetings;
}

export function createDesktopMeetingsCalendarHost(): MeetingsCalendarHost {
  return {
    async getStatus() {
      return (
        (await desktopMeetings()?.getStatus()) ?? {
          connected: false,
          accountEmail: null,
        }
      );
    },
    async connect() {
      const meetings = desktopMeetings();
      if (!meetings) {
        return { connected: false, accountEmail: null };
      }
      return meetings.connect();
    },
    async listToday() {
      return (await desktopMeetings()?.listToday()) ?? [];
    },
  };
}
