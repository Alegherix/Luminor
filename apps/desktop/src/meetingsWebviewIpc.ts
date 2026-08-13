import { ipcMain } from "electron";

import { DESKTOP_IPC_CHANNELS } from "./ipcChannels";
import {
  MeetingWebViewManager,
  parseMeetingEmbedBounds,
  type MeetingWebViewState,
} from "./meetingsWebview";

export function registerMeetingsWebviewIpc(input: {
  readonly manager: MeetingWebViewManager;
}): void {
  const IPC = DESKTOP_IPC_CHANNELS.meetings;
  const manager = input.manager;

  ipcMain.removeHandler(IPC.joinEmbed);
  ipcMain.handle(IPC.joinEmbed, async (_event, payload: unknown) => {
    const url =
      typeof payload === "object" && payload !== null
        ? (payload as { url?: unknown }).url
        : undefined;
    if (typeof url !== "string" || url.trim().length === 0) {
      throw new Error("missing url");
    }
    return manager.join(url.trim());
  });

  ipcMain.removeHandler(IPC.hideEmbed);
  ipcMain.handle(IPC.hideEmbed, async (): Promise<MeetingWebViewState> => manager.hide());

  ipcMain.removeHandler(IPC.showEmbed);
  ipcMain.handle(IPC.showEmbed, async (): Promise<MeetingWebViewState> => manager.show());

  ipcMain.removeHandler(IPC.leaveEmbed);
  ipcMain.handle(IPC.leaveEmbed, async (): Promise<MeetingWebViewState> => manager.leave());

  ipcMain.removeHandler(IPC.setEmbedBounds);
  ipcMain.handle(IPC.setEmbedBounds, async (_event, payload: unknown) =>
    manager.setBounds(parseMeetingEmbedBounds(payload)),
  );

  ipcMain.removeHandler(IPC.getEmbedState);
  ipcMain.handle(IPC.getEmbedState, async (): Promise<MeetingWebViewState> => manager.getState());
}
