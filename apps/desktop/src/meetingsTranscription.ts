import * as ChildProcess from "node:child_process";
import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import type {
  MeetingsTranscriptionPointResult,
  MeetingsTranscriptionState,
} from "@luminor/contracts";

import { sanitizeMeetingSessionId } from "./meetingsRecording";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const JSON_PRETTY_SPACES = 2;

export const MEETING_TRANSCRIPTION_CONFIG_FILE = "meeting-transcription.json";
export const DEFAULT_TRANSCRIBE_ARGS = [
  "--input",
  "{recordingPath}",
  "--output",
  "{outputPath}",
] as const;

export const MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY =
  "Point at the transcription environment. Choose the missiondeck-transcribe command or the transcription venv.";

export const IDLE_MEETINGS_TRANSCRIPTION: MeetingsTranscriptionState = {
  status: "idle",
  sessionId: null,
  transcriptPath: null,
  text: null,
  error: null,
};

export type MeetingsTranscriptionConfig = {
  readonly enabled: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly venv?: string;
  readonly updatedAt: string;
};

export type MeetingsTranscriptionFs = {
  mkdir(path: string, options: { recursive: true; mode?: number }): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string, options?: { mode?: number }): Promise<void>;
  access(path: string, mode?: number): Promise<void>;
  stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
};

export type MeetingsTranscriptionSpawn = (
  command: string,
  args: readonly string[],
) => Promise<{ ok: true } | { ok: false; error: string }>;

export type MeetingsTranscriptionManagerDeps = {
  readonly homeDir: string;
  readonly now?: () => Date;
  readonly homedir?: () => string;
  readonly fs?: MeetingsTranscriptionFs;
  readonly spawn?: MeetingsTranscriptionSpawn;
  readonly pickEnvironmentPath?: () => Promise<string | null>;
};

function nodeFs(): MeetingsTranscriptionFs {
  return {
    mkdir: (path, options) => FS.mkdir(path, options).then(() => undefined),
    readFile: (path, encoding) => FS.readFile(path, encoding),
    writeFile: (path, data, options) => FS.writeFile(path, data, options),
    access: (path, mode) => FS.access(path, mode),
    stat: (path) => FS.stat(path),
  };
}

function nodeSpawn(): MeetingsTranscriptionSpawn {
  return (command, args) =>
    new Promise((resolve) => {
      const child = ChildProcess.spawn(command, [...args], { shell: false });
      const stderr: Buffer[] = [];
      child.stderr.on("data", (chunk: Buffer) => {
        stderr.push(chunk);
      });
      child.on("error", (error) => {
        resolve({ ok: false, error: error.message });
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ ok: true });
          return;
        }
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        resolve({
          ok: false,
          error: detail.length > 0 ? detail : `transcription command failed (${code ?? "unknown"})`,
        });
      });
    });
}

export function defaultMissiondeckTranscribeCommand(home = OS.homedir()): string {
  return Path.join(home, ".local", "bin", "missiondeck-transcribe");
}

export function defaultMissiondeckTranscribeVenv(home = OS.homedir()): string {
  return Path.join(home, ".local", "share", "missiondeck", "transcription-venv");
}

export function meetingTranscriptionConfigPath(homeDir: string): string {
  return Path.join(homeDir, "config", MEETING_TRANSCRIPTION_CONFIG_FILE);
}

export function meetingsTranscriptDir(homeDir: string, sessionId: string): string {
  return Path.join(homeDir, "meetings", sanitizeMeetingSessionId(sessionId), "transcripts");
}

export function meetingsTranscriptJsonPath(homeDir: string, sessionId: string): string {
  return Path.join(meetingsTranscriptDir(homeDir, sessionId), "transcript.json");
}

export function meetingsTranscriptTextPath(homeDir: string, sessionId: string): string {
  return Path.join(meetingsTranscriptDir(homeDir, sessionId), "transcript.txt");
}

export function expandTranscriptionArgs(
  args: readonly string[],
  input: { readonly recordingPath: string; readonly outputPath: string },
): string[] {
  return args.map((arg) =>
    arg
      .replaceAll("{recordingPath}", input.recordingPath)
      .replaceAll("{outputPath}", input.outputPath),
  );
}

type TranscriptSegment = {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
};

function parseTranscriptSegment(value: unknown): TranscriptSegment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const segment = value as { startMs?: unknown; endMs?: unknown; text?: unknown };
  const text = typeof segment.text === "string" ? segment.text.trim() : "";
  if (text.length === 0) {
    return null;
  }
  if (
    typeof segment.startMs !== "number" ||
    typeof segment.endMs !== "number" ||
    !Number.isFinite(segment.startMs) ||
    !Number.isFinite(segment.endMs)
  ) {
    return null;
  }
  return { startMs: segment.startMs, endMs: segment.endMs, text };
}

export function transcriptTextFromRaw(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const candidate =
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { segments?: unknown }).segments)
        ? (parsed as { segments: unknown[] }).segments
        : parsed;
    if (!Array.isArray(candidate)) {
      return trimmed;
    }
    const lines: string[] = [];
    for (const item of candidate) {
      const segment = parseTranscriptSegment(item);
      if (!segment) {
        return null;
      }
      lines.push(segment.text);
    }
    return lines.join("\n");
  } catch {
    return trimmed;
  }
}

function parseStoredConfig(raw: string): MeetingsTranscriptionConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Partial<MeetingsTranscriptionConfig>;
  if (
    record.enabled !== true ||
    typeof record.command !== "string" ||
    record.command.trim().length === 0
  ) {
    return null;
  }
  if (!Array.isArray(record.args) || record.args.some((arg) => typeof arg !== "string")) {
    return null;
  }
  return {
    enabled: true,
    command: record.command.trim(),
    args: record.args,
    ...(typeof record.venv === "string" && record.venv.trim().length > 0
      ? { venv: record.venv.trim() }
      : {}),
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt.trim().length > 0
        ? record.updatedAt.trim()
        : new Date().toISOString(),
  };
}

async function pathExists(
  fs: MeetingsTranscriptionFs,
  path: string,
  mode?: number,
): Promise<boolean> {
  try {
    await fs.access(path, mode);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(fs: MeetingsTranscriptionFs, path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export function createMeetingsTranscriptionManager(deps: MeetingsTranscriptionManagerDeps) {
  const fs = deps.fs ?? nodeFs();
  const spawn = deps.spawn ?? nodeSpawn();
  const now = deps.now ?? (() => new Date());
  const userHome = deps.homedir ?? OS.homedir;

  const writeConfig = async (config: MeetingsTranscriptionConfig): Promise<void> => {
    const configPath = meetingTranscriptionConfigPath(deps.homeDir);
    await fs.mkdir(Path.dirname(configPath), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    await fs.writeFile(configPath, `${JSON.stringify(config, null, JSON_PRETTY_SPACES)}\n`, {
      mode: PRIVATE_FILE_MODE,
    });
  };

  const seedConfig = async (): Promise<MeetingsTranscriptionConfig | null> => {
    const configPath = meetingTranscriptionConfigPath(deps.homeDir);
    try {
      const existing = parseStoredConfig(await fs.readFile(configPath, "utf8"));
      if (existing) {
        return existing;
      }
    } catch {}

    const command = defaultMissiondeckTranscribeCommand(userHome());
    if (!(await pathExists(fs, command, FS.constants.X_OK))) {
      return null;
    }
    const venv = defaultMissiondeckTranscribeVenv(userHome());
    const config: MeetingsTranscriptionConfig = {
      enabled: true,
      command,
      args: [...DEFAULT_TRANSCRIBE_ARGS],
      ...((await pathExists(fs, venv)) ? { venv } : {}),
      updatedAt: now().toISOString(),
    };
    await writeConfig(config);
    return config;
  };

  const resolvePickedCommand = async (
    pickedPath: string,
  ): Promise<{ command: string; venv?: string } | null> => {
    if (await isDirectory(fs, pickedPath)) {
      const nestedCommand = Path.join(pickedPath, "missiondeck-transcribe");
      const binCommand = Path.join(pickedPath, "bin", "missiondeck-transcribe");
      if (await pathExists(fs, nestedCommand, FS.constants.X_OK)) {
        return { command: nestedCommand };
      }
      if (await pathExists(fs, binCommand, FS.constants.X_OK)) {
        return { command: binCommand };
      }
      const venvPython = Path.join(pickedPath, "bin", "python");
      const defaultCommand = defaultMissiondeckTranscribeCommand(userHome());
      if (
        (await pathExists(fs, venvPython)) &&
        (await pathExists(fs, defaultCommand, FS.constants.X_OK))
      ) {
        return { command: defaultCommand, venv: pickedPath };
      }
      return null;
    }
    return { command: pickedPath };
  };

  const writeTranscriptArtifacts = async (input: {
    sessionId: string;
    raw: string;
  }): Promise<MeetingsTranscriptionState> => {
    const text = transcriptTextFromRaw(input.raw);
    if (text === null) {
      return {
        status: "failed",
        sessionId: input.sessionId,
        transcriptPath: null,
        text: null,
        error: "Transcript output is invalid.",
      };
    }
    const jsonPath = meetingsTranscriptJsonPath(deps.homeDir, input.sessionId);
    const textPath = meetingsTranscriptTextPath(deps.homeDir, input.sessionId);
    await fs.mkdir(Path.dirname(textPath), { recursive: true });
    await fs.writeFile(jsonPath, input.raw.endsWith("\n") ? input.raw : `${input.raw}\n`);
    await fs.writeFile(textPath, text.endsWith("\n") ? text : `${text}\n`);
    return {
      status: "ready",
      sessionId: input.sessionId,
      transcriptPath: textPath,
      text,
      error: null,
    };
  };

  return {
    async transcribe(input: {
      sessionId: string;
      recordingPath: string;
    }): Promise<MeetingsTranscriptionState> {
      const config = await seedConfig();
      if (!config) {
        return {
          status: "needs-environment",
          sessionId: input.sessionId,
          transcriptPath: null,
          text: null,
          error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
        };
      }
      const outputPath = meetingsTranscriptJsonPath(deps.homeDir, input.sessionId);
      await fs.mkdir(Path.dirname(outputPath), { recursive: true });
      const args = expandTranscriptionArgs(config.args, {
        recordingPath: input.recordingPath,
        outputPath,
      });
      const ran = await spawn(config.command, args);
      if (!ran.ok) {
        return {
          status: "failed",
          sessionId: input.sessionId,
          transcriptPath: null,
          text: null,
          error: ran.error,
        };
      }
      let raw: string;
      try {
        raw = await fs.readFile(outputPath, "utf8");
      } catch {
        return {
          status: "failed",
          sessionId: input.sessionId,
          transcriptPath: null,
          text: null,
          error: "Transcript output is missing.",
        };
      }
      return writeTranscriptArtifacts({ sessionId: input.sessionId, raw });
    },

    async getTranscript(sessionId: string): Promise<MeetingsTranscriptionState> {
      const textPath = meetingsTranscriptTextPath(deps.homeDir, sessionId);
      try {
        const text = (await fs.readFile(textPath, "utf8")).trim();
        if (text.length > 0) {
          return {
            status: "ready",
            sessionId,
            transcriptPath: textPath,
            text,
            error: null,
          };
        }
      } catch {}
      const jsonPath = meetingsTranscriptJsonPath(deps.homeDir, sessionId);
      try {
        return await writeTranscriptArtifacts({
          sessionId,
          raw: await fs.readFile(jsonPath, "utf8"),
        });
      } catch {}
      if (!(await seedConfig())) {
        return {
          status: "needs-environment",
          sessionId,
          transcriptPath: null,
          text: null,
          error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
        };
      }
      return {
        ...IDLE_MEETINGS_TRANSCRIPTION,
        sessionId,
      };
    },

    async pointAtEnvironment(): Promise<MeetingsTranscriptionPointResult> {
      const picked = (await deps.pickEnvironmentPath?.())?.trim() ?? "";
      if (picked.length === 0) {
        return {
          status: "needs-environment",
          error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
        };
      }
      const resolved = await resolvePickedCommand(picked);
      if (!resolved) {
        return {
          status: "needs-environment",
          error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
        };
      }
      await writeConfig({
        enabled: true,
        command: resolved.command,
        args: [...DEFAULT_TRANSCRIBE_ARGS],
        ...(resolved.venv ? { venv: resolved.venv } : {}),
        updatedAt: now().toISOString(),
      });
      return { status: "configured", error: null };
    },
  };
}
