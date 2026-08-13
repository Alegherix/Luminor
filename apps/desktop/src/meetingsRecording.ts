import * as FS from "node:fs";
import * as Path from "node:path";

import type { MeetingsRecordingState } from "@luminor/contracts";

import {
  loadMeetingsLoopback,
  unloadMeetingsLoopback,
  type MeetingsLoopbackDeps,
  type MeetingsLoopbackModule,
} from "./meetingsLoopback";

const IDLE_RECORDING: MeetingsRecordingState = {
  status: "idle",
  mode: null,
  sessionId: null,
  filePath: null,
  degradation: null,
};

export type MeetingsRecordingWriteStream = {
  write(chunk: Uint8Array): boolean;
  end(): void;
  once(event: "finish" | "error", listener: (...args: unknown[]) => void): void;
};

export type MeetingsRecordingFs = {
  mkdir(path: string, options: { recursive: true }): Promise<void> | void;
  createWriteStream(path: string): MeetingsRecordingWriteStream;
};

export type MeetingsRecordingStoreDeps = {
  readonly homeDir: string;
  readonly now?: () => Date;
  readonly randomId?: () => string;
  readonly fs?: MeetingsRecordingFs;
  readonly loopback?: MeetingsLoopbackDeps;
};

function nodeFs(): MeetingsRecordingFs {
  return {
    mkdir: (path, options) => FS.promises.mkdir(path, options).then(() => undefined),
    createWriteStream: (path) => FS.createWriteStream(path),
  };
}

function defaultRandomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function sanitizeMeetingSessionId(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return safe.length > 0 ? safe : "session";
}

export function meetingsRecordingDir(homeDir: string, sessionId: string): string {
  return Path.join(homeDir, "meetings", sanitizeMeetingSessionId(sessionId), "recordings");
}

export function meetingsRecordingFilePath(input: {
  readonly homeDir: string;
  readonly sessionId: string;
  readonly startedAt: Date;
  readonly recordingId: string;
}): string {
  const stamp = input.startedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return Path.join(
    meetingsRecordingDir(input.homeDir, input.sessionId),
    `${stamp}-${input.recordingId}.webm`,
  );
}

type ActiveRecording = {
  readonly sessionId: string;
  readonly filePath: string;
  readonly stream: MeetingsRecordingWriteStream;
};

function waitForStreamEnd(stream: MeetingsRecordingWriteStream): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    stream.once("finish", finish);
    stream.once("error", finish);
    stream.end();
  });
}

export function createMeetingsRecordingManager(deps: MeetingsRecordingStoreDeps) {
  const fs = deps.fs ?? nodeFs();
  const now = deps.now ?? (() => new Date());
  const randomId = deps.randomId ?? defaultRandomId;
  let active: ActiveRecording | null = null;
  let loopbackModule: MeetingsLoopbackModule | null = null;

  const snapshot = (): MeetingsRecordingState => {
    if (!active) {
      return IDLE_RECORDING;
    }
    return {
      status: "recording",
      mode: null,
      sessionId: active.sessionId,
      filePath: active.filePath,
      degradation: null,
    };
  };

  const stopFile = async (): Promise<MeetingsRecordingState> => {
    const current = active;
    active = null;
    if (current) {
      await waitForStreamEnd(current.stream);
    }
    return IDLE_RECORDING;
  };

  return {
    getState: snapshot,
    async start(sessionId: string): Promise<MeetingsRecordingState> {
      if (active?.sessionId === sessionId) {
        return snapshot();
      }
      if (active) {
        await stopFile();
      }
      const startedAt = now();
      const filePath = meetingsRecordingFilePath({
        homeDir: deps.homeDir,
        sessionId,
        startedAt,
        recordingId: randomId(),
      });
      await fs.mkdir(Path.dirname(filePath), { recursive: true });
      active = {
        sessionId,
        filePath,
        stream: fs.createWriteStream(filePath),
      };
      return snapshot();
    },
    append(chunk: Uint8Array): void {
      active?.stream.write(chunk);
    },
    async prepareLoopback() {
      const loaded = await loadMeetingsLoopback(deps.loopback);
      if (!loaded.ok || !loaded.module) {
        return {
          ok: false as const,
          error: loaded.error ?? "failed to load Luminor loopback",
        };
      }
      loopbackModule = loaded.module;
      return {
        ok: true as const,
        sourceName: loaded.module.sourceName,
        moduleId: loaded.module.moduleId,
      };
    },
    async releaseLoopback(): Promise<void> {
      const module = loopbackModule;
      loopbackModule = null;
      if (!module) {
        return;
      }
      await unloadMeetingsLoopback(module.moduleId, deps.loopback);
    },
    async stop(): Promise<MeetingsRecordingState> {
      await stopFile();
      const module = loopbackModule;
      loopbackModule = null;
      if (module) {
        await unloadMeetingsLoopback(module.moduleId, deps.loopback);
      }
      return IDLE_RECORDING;
    },
  };
}

export function recordingChunkFromPayload(payload: unknown): Uint8Array | null {
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  }
  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }
  if (typeof payload === "object" && payload !== null) {
    const chunk = (payload as { chunk?: unknown }).chunk;
    return recordingChunkFromPayload(chunk);
  }
  return null;
}
