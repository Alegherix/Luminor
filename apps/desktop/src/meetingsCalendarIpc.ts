import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";

import { createMeetingsCalendarService } from "./meetingsCalendar";
import { listMeetingsHistory } from "./meetingsHistory";
import { DESKTOP_IPC_CHANNELS } from "./ipcChannels";

const PICK_CLIENT_JSON_OPTIONS: OpenDialogOptions = {
  properties: ["openFile"],
  filters: [{ name: "OAuth client JSON", extensions: ["json"] }],
};

export async function pickInstalledClientJsonPath(
  owner: BrowserWindow | null,
): Promise<string | null> {
  const result = owner
    ? await dialog.showOpenDialog(owner, PICK_CLIENT_JSON_OPTIONS)
    : await dialog.showOpenDialog(PICK_CLIENT_JSON_OPTIONS);
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0] ?? null;
}

export function registerMeetingsCalendarIpc(input: {
  readonly homeDir: string;
  readonly getOwnerWindow: () => BrowserWindow | null;
}): void {
  const IPC = DESKTOP_IPC_CHANNELS.meetings;
  const service = createMeetingsCalendarService({
    homeDir: input.homeDir,
    pickClientJson: async () => pickInstalledClientJsonPath(input.getOwnerWindow()),
    openExternal: async (url) => {
      await shell.openExternal(url);
    },
  });

  ipcMain.removeHandler(IPC.getStatus);
  ipcMain.handle(IPC.getStatus, async () => service.getStatus());
  ipcMain.removeHandler(IPC.connect);
  ipcMain.handle(IPC.connect, async () => service.connect());
  ipcMain.removeHandler(IPC.listToday);
  ipcMain.handle(IPC.listToday, async () => service.listToday());
  ipcMain.removeHandler(IPC.listHistory);
  ipcMain.handle(IPC.listHistory, async () => listMeetingsHistory({ homeDir: input.homeDir }));
}
