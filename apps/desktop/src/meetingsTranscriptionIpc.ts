import * as FS from "node:fs";
import * as Path from "node:path";

import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import type {
  MeetingsTranscriptionPointResult,
  MeetingsTranscriptionState,
} from "@luminor/contracts";

import { DESKTOP_IPC_CHANNELS } from "./ipcChannels";
import {
  createMeetingsTranscriptionManager,
  MEETING_TRANSCRIPTION_SCRIPT_NAME,
} from "./meetingsTranscription";

export function resolveBundledTranscriptionScript(
  dirname = __dirname,
  resourcesPath = process.resourcesPath,
): string | null {
  const candidates = [
    Path.join(dirname, "../resources", MEETING_TRANSCRIPTION_SCRIPT_NAME),
    Path.join(dirname, "../prod-resources", MEETING_TRANSCRIPTION_SCRIPT_NAME),
    Path.join(resourcesPath, "resources", MEETING_TRANSCRIPTION_SCRIPT_NAME),
    Path.join(resourcesPath, MEETING_TRANSCRIPTION_SCRIPT_NAME),
  ];
  return candidates.find((candidate) => FS.existsSync(candidate)) ?? null;
}

const PICK_TRANSCRIPTION_ENVIRONMENT_OPTIONS: OpenDialogOptions = {
  properties: ["openFile", "openDirectory"],
  title: "Point at the transcription environment",
};

export async function pickTranscriptionEnvironmentPath(
  owner: BrowserWindow | null,
): Promise<string | null> {
  const result = owner
    ? await dialog.showOpenDialog(owner, PICK_TRANSCRIPTION_ENVIRONMENT_OPTIONS)
    : await dialog.showOpenDialog(PICK_TRANSCRIPTION_ENVIRONMENT_OPTIONS);
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0] ?? null;
}

export function registerMeetingsTranscriptionIpc(input: {
  readonly homeDir: string;
  readonly getOwnerWindow: () => BrowserWindow | null;
}): void {
  const IPC = DESKTOP_IPC_CHANNELS.meetings;
  const bundledScriptPath = resolveBundledTranscriptionScript();
  const manager = createMeetingsTranscriptionManager({
    homeDir: input.homeDir,
    ...(bundledScriptPath === null ? {} : { bundledScriptPath }),
    pickEnvironmentPath: async () => pickTranscriptionEnvironmentPath(input.getOwnerWindow()),
  });

  ipcMain.removeHandler(IPC.transcribeRecording);
  ipcMain.handle(
    IPC.transcribeRecording,
    async (_event, payload: unknown): Promise<MeetingsTranscriptionState> => {
      const record = typeof payload === "object" && payload !== null ? payload : {};
      const sessionId = (record as { sessionId?: unknown }).sessionId;
      const recordingPath = (record as { recordingPath?: unknown }).recordingPath;
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new Error("missing sessionId");
      }
      if (typeof recordingPath !== "string" || recordingPath.trim().length === 0) {
        throw new Error("missing recordingPath");
      }
      return manager.transcribe({
        sessionId: sessionId.trim(),
        recordingPath: recordingPath.trim(),
      });
    },
  );

  ipcMain.removeHandler(IPC.getTranscript);
  ipcMain.handle(
    IPC.getTranscript,
    async (_event, payload: unknown): Promise<MeetingsTranscriptionState> => {
      const sessionId =
        typeof payload === "object" && payload !== null
          ? (payload as { sessionId?: unknown }).sessionId
          : undefined;
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new Error("missing sessionId");
      }
      return manager.getTranscript(sessionId.trim());
    },
  );

  ipcMain.removeHandler(IPC.pointAtTranscriptionEnvironment);
  ipcMain.handle(
    IPC.pointAtTranscriptionEnvironment,
    async (): Promise<MeetingsTranscriptionPointResult> => manager.pointAtEnvironment(),
  );

  ipcMain.removeHandler(IPC.writeSummary);
  ipcMain.handle(
    IPC.writeSummary,
    async (_event, payload: unknown): Promise<{ summaryPath: string }> => {
      const record = typeof payload === "object" && payload !== null ? payload : {};
      const sessionId = (record as { sessionId?: unknown }).sessionId;
      const text = (record as { text?: unknown }).text;
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new Error("missing sessionId");
      }
      if (typeof text !== "string" || text.trim().length === 0) {
        throw new Error("missing summary text");
      }
      return manager.writeSummary({
        sessionId: sessionId.trim(),
        text,
      });
    },
  );

  ipcMain.removeHandler(IPC.getSummary);
  ipcMain.handle(
    IPC.getSummary,
    async (_event, payload: unknown): Promise<{ text: string; summaryPath: string } | null> => {
      const sessionId =
        typeof payload === "object" && payload !== null
          ? (payload as { sessionId?: unknown }).sessionId
          : undefined;
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new Error("missing sessionId");
      }
      return manager.readSummary(sessionId.trim());
    },
  );

  ipcMain.removeHandler(IPC.writeNotes);
  ipcMain.handle(
    IPC.writeNotes,
    async (_event, payload: unknown): Promise<{ notesPath: string }> => {
      const record = typeof payload === "object" && payload !== null ? payload : {};
      const sessionId = (record as { sessionId?: unknown }).sessionId;
      const markdown = (record as { markdown?: unknown }).markdown;
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new Error("missing sessionId");
      }
      if (typeof markdown !== "string") {
        throw new Error("missing notes markdown");
      }
      return manager.writeNotes({
        sessionId: sessionId.trim(),
        markdown,
      });
    },
  );

  ipcMain.removeHandler(IPC.getNotes);
  ipcMain.handle(
    IPC.getNotes,
    async (_event, payload: unknown): Promise<{ markdown: string; notesPath: string } | null> => {
      const sessionId =
        typeof payload === "object" && payload !== null
          ? (payload as { sessionId?: unknown }).sessionId
          : undefined;
      if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
        throw new Error("missing sessionId");
      }
      return manager.readNotes(sessionId.trim());
    },
  );
}
