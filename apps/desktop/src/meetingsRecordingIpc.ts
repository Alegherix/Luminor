import { ipcMain } from "electron";
import type { MeetingsRecordingState } from "@luminor/contracts";

import { DESKTOP_IPC_CHANNELS } from "./ipcChannels";
import { createMeetingsRecordingManager, recordingChunkFromPayload } from "./meetingsRecording";

export function registerMeetingsRecordingIpc(input: { readonly homeDir: string }): void {
  const IPC = DESKTOP_IPC_CHANNELS.meetings;
  const manager = createMeetingsRecordingManager({ homeDir: input.homeDir });

  ipcMain.removeHandler(IPC.startRecording);
  ipcMain.handle(
    IPC.startRecording,
    async (_event, payload: unknown): Promise<MeetingsRecordingState> => {
      const sessionId =
        typeof payload === "object" && payload !== null
          ? (payload as { sessionId?: unknown }).sessionId
          : undefined;
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new Error("missing sessionId");
      }
      return manager.start(sessionId.trim());
    },
  );

  ipcMain.removeHandler(IPC.appendRecordingChunk);
  ipcMain.handle(IPC.appendRecordingChunk, async (_event, payload: unknown) => {
    const chunk = recordingChunkFromPayload(payload);
    if (!chunk) {
      throw new Error("missing recording chunk");
    }
    manager.append(chunk);
  });

  ipcMain.removeHandler(IPC.stopRecording);
  ipcMain.handle(IPC.stopRecording, async (): Promise<MeetingsRecordingState> => manager.stop());

  ipcMain.removeHandler(IPC.getRecordingState);
  ipcMain.handle(
    IPC.getRecordingState,
    async (): Promise<MeetingsRecordingState> => manager.getState(),
  );

  ipcMain.removeHandler(IPC.prepareLoopback);
  ipcMain.handle(IPC.prepareLoopback, async () => manager.prepareLoopback());

  ipcMain.removeHandler(IPC.releaseLoopback);
  ipcMain.handle(IPC.releaseLoopback, async () => {
    await manager.releaseLoopback();
  });
}
