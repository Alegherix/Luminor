import type { DesktopBridge, MeetingsEmbedState } from "@luminor/contracts";

import type { MeetingsEmbedHost } from "./meetingsWorkspace";

const IDLE_EMBED_STATE: MeetingsEmbedState = {
  joined: false,
  visible: false,
  url: null,
  partition: "persist:luminor-meet",
};

function desktopMeetings() {
  const desktopBridge = (globalThis as typeof globalThis & { desktopBridge?: DesktopBridge })
    .desktopBridge;
  return desktopBridge?.meetings;
}

export function createDesktopMeetingsEmbedHost(): MeetingsEmbedHost {
  return {
    async join(url) {
      const meetings = desktopMeetings();
      if (!meetings?.joinEmbed) {
        throw new Error("Meet embed is only available in the desktop app.");
      }
      return meetings.joinEmbed({ url });
    },
    async hide() {
      return (await desktopMeetings()?.hideEmbed()) ?? IDLE_EMBED_STATE;
    },
    async show() {
      return (await desktopMeetings()?.showEmbed()) ?? IDLE_EMBED_STATE;
    },
    async leave() {
      return (await desktopMeetings()?.leaveEmbed()) ?? IDLE_EMBED_STATE;
    },
    async getState() {
      return (await desktopMeetings()?.getEmbedState()) ?? IDLE_EMBED_STATE;
    },
  };
}
