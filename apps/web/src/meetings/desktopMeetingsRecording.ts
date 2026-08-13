import type {
  DesktopBridge,
  MeetingsRecordingState as DesktopRecordingState,
} from "@luminor/contracts";

import { captureMeetingsRecordingAudio } from "./meetingsRecordingCapture";
import {
  IDLE_MEETINGS_RECORDING,
  type MeetingsRecordingHost,
  type MeetingsRecordingState,
} from "./meetingsWorkspace";

const RECORDER_TIMESLICE_MS = 1_000;

type MeetingsDesktopBridge = NonNullable<DesktopBridge["meetings"]>;

type MediaRecorderLike = {
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

export type DesktopMeetingsRecordingHostDeps = {
  readonly meetings?: () => MeetingsDesktopBridge | undefined;
  readonly mediaDevices?: {
    enumerateDevices(): Promise<readonly Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">[]>;
    getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  };
  readonly mediaRecorderCtor?: new (
    stream: MediaStream,
    options?: MediaRecorderOptions,
  ) => MediaRecorderLike;
  readonly audioContextCtor?: new (opts?: { sampleRate?: number }) => AudioContext;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
};

function desktopMeetings(): MeetingsDesktopBridge | undefined {
  const desktopBridge = (globalThis as typeof globalThis & { desktopBridge?: DesktopBridge })
    .desktopBridge;
  return desktopBridge?.meetings;
}

function toWorkspaceState(state: DesktopRecordingState | null | undefined): MeetingsRecordingState {
  if (!state) {
    return IDLE_MEETINGS_RECORDING;
  }
  return {
    status: state.status,
    mode: state.mode,
    sessionId: state.sessionId,
    filePath: state.filePath,
    degradation: state.degradation,
  };
}

function pickAudioMime(ctor: { isTypeSupported?(type: string): boolean } | undefined): string {
  if (ctor?.isTypeSupported?.("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (ctor?.isTypeSupported?.("audio/webm")) {
    return "audio/webm";
  }
  return "";
}

export function createDesktopMeetingsRecordingHost(
  deps: DesktopMeetingsRecordingHostDeps = {},
): MeetingsRecordingHost {
  const resolveMeetings = deps.meetings ?? desktopMeetings;
  let state: MeetingsRecordingState = IDLE_MEETINGS_RECORDING;
  let captureStop: (() => Promise<void>) | null = null;
  let recorder: MediaRecorderLike | null = null;
  let appendQueue: Promise<void> = Promise.resolve();

  const stopCapture = async () => {
    const currentRecorder = recorder;
    recorder = null;
    if (currentRecorder) {
      await new Promise<void>((resolve) => {
        currentRecorder.onstop = () => resolve();
        try {
          currentRecorder.stop();
        } catch {
          resolve();
        }
      });
    }
    const stop = captureStop;
    captureStop = null;
    await stop?.();
  };

  const stopRecording = async (): Promise<MeetingsRecordingState> => {
    await stopCapture();
    await appendQueue;
    const meetings = resolveMeetings();
    if (meetings?.stopRecording) {
      await meetings.stopRecording();
    }
    state = IDLE_MEETINGS_RECORDING;
    return state;
  };

  return {
    async start(sessionId: string) {
      const meetings = resolveMeetings();
      if (!meetings?.startRecording) {
        return IDLE_MEETINGS_RECORDING;
      }
      if (state.status === "recording" && state.sessionId === sessionId) {
        return state;
      }
      if (state.status === "recording") {
        await stopRecording();
      }

      const opened = await meetings.startRecording({ sessionId });
      const mediaDevices =
        deps.mediaDevices ??
        (typeof navigator === "undefined" ? undefined : navigator.mediaDevices);
      const MediaRecorderCtor =
        deps.mediaRecorderCtor ??
        (typeof MediaRecorder === "undefined"
          ? undefined
          : (MediaRecorder as unknown as DesktopMeetingsRecordingHostDeps["mediaRecorderCtor"]));
      if (!mediaDevices || !MediaRecorderCtor) {
        await meetings.stopRecording();
        state = {
          ...IDLE_MEETINGS_RECORDING,
          sessionId,
          filePath: opened.filePath,
          degradation: "Recording could not start.",
        };
        return state;
      }

      try {
        const capture = await captureMeetingsRecordingAudio({
          prepareLoopback: async () => {
            const prepared = await meetings.prepareLoopback();
            return prepared.ok
              ? {
                  ok: true,
                  sourceName: prepared.sourceName ?? "",
                  moduleId: prepared.moduleId ?? "",
                }
              : { ok: false, error: prepared.error ?? "failed to load Luminor loopback" };
          },
          releaseLoopback: () => meetings.releaseLoopback(),
          mediaDevices,
          ...(deps.now ? { now: deps.now } : {}),
          ...(deps.sleep ? { sleep: deps.sleep } : {}),
          ...(deps.audioContextCtor ? { audioContextCtor: deps.audioContextCtor } : {}),
        });
        captureStop = () => capture.stop();
        const mimeType = pickAudioMime(
          MediaRecorderCtor as { isTypeSupported?(type: string): boolean },
        );
        const nextRecorder = new MediaRecorderCtor(
          capture.stream,
          mimeType.length > 0 ? { mimeType } : undefined,
        );
        nextRecorder.ondataavailable = (event) => {
          if (event.data.size === 0) {
            return;
          }
          appendQueue = appendQueue
            .then(async () => {
              const buffer = new Uint8Array(await event.data.arrayBuffer());
              await meetings.appendRecordingChunk(buffer);
            })
            .catch(() => undefined);
        };
        nextRecorder.start(RECORDER_TIMESLICE_MS);
        recorder = nextRecorder;
        state = {
          status: "recording",
          mode: capture.mode,
          sessionId,
          filePath: opened.filePath,
          degradation: capture.degradation,
        };
        return state;
      } catch (error) {
        await stopCapture();
        await meetings.stopRecording();
        state = {
          ...IDLE_MEETINGS_RECORDING,
          sessionId,
          filePath: opened.filePath,
          degradation: error instanceof Error ? error.message : "Recording could not start.",
        };
        return state;
      }
    },
    stop: stopRecording,
    async getState() {
      if (state.status === "recording") {
        return state;
      }
      const meetings = resolveMeetings();
      return toWorkspaceState((await meetings?.getRecordingState()) ?? IDLE_MEETINGS_RECORDING);
    },
  };
}
