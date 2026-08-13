import type { DesktopBridge } from "@luminor/contracts";

import type { MeetingsExternalHost } from "./meetingsWorkspace";

function desktopBridge(): DesktopBridge | undefined {
  return (globalThis as typeof globalThis & { desktopBridge?: DesktopBridge }).desktopBridge;
}

export function createDesktopMeetingsExternalHost(): MeetingsExternalHost {
  return {
    async open(url) {
      const bridge = desktopBridge();
      if (!bridge?.openExternal) {
        return false;
      }
      return bridge.openExternal(url);
    },
  };
}
