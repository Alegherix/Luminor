import { MEETINGS_LOOPBACK_DEGRADATION, type MeetingsRecordingMode } from "./meetingsWorkspace";
import { createMeetingsMixedAudioStream, type MeetingsMixedAudio } from "./meetingsRecordingMixer";

const LOOPBACK_POLL_MS = 100;
const LOOPBACK_TIMEOUT_MS = 2_000;

export type MeetingsLoopbackPrepareResult =
  | { readonly ok: true; readonly sourceName: string; readonly moduleId: string }
  | { readonly ok: false; readonly error: string };

export type MeetingsRecordingMediaDevices = {
  enumerateDevices(): Promise<readonly Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
};

export type MeetingsRecordingCapture = {
  readonly stream: MediaStream;
  readonly mode: MeetingsRecordingMode;
  readonly degradation: string | null;
  stop(): Promise<void>;
};

export type MeetingsRecordingCaptureDeps = {
  readonly prepareLoopback: () => Promise<MeetingsLoopbackPrepareResult>;
  readonly releaseLoopback: () => Promise<void>;
  readonly mediaDevices: MeetingsRecordingMediaDevices;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly audioContextCtor?: new (opts?: { sampleRate?: number }) => AudioContext;
};

function stopStream(stream: MediaStream | null): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function loopbackDeviceMatches(
  device: Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">,
  sourceName: string,
): boolean {
  if (device.kind !== "audioinput") {
    return false;
  }
  const haystack = `${device.label} ${device.deviceId}`.toLowerCase();
  return (
    haystack.includes("luminor_loopback") ||
    haystack.includes("luminor loopback") ||
    haystack.includes(sourceName.toLowerCase())
  );
}

async function waitForLoopbackDevice(
  deps: MeetingsRecordingCaptureDeps,
  sourceName: string,
): Promise<Pick<MediaDeviceInfo, "deviceId" | "kind" | "label"> | null> {
  const now = deps.now ?? (() => Date.now());
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + LOOPBACK_TIMEOUT_MS;
  while (now() <= deadline) {
    const devices = await deps.mediaDevices.enumerateDevices();
    const match = devices.find((device) => loopbackDeviceMatches(device, sourceName));
    if (match) {
      return match;
    }
    if (now() >= deadline) {
      return null;
    }
    await sleep(LOOPBACK_POLL_MS);
  }
  return null;
}

async function captureLoopbackStream(
  deps: MeetingsRecordingCaptureDeps,
): Promise<{ stream: MediaStream } | { error: string }> {
  const prepared = await deps.prepareLoopback();
  if (!prepared.ok) {
    return { error: prepared.error };
  }
  try {
    const device = await waitForLoopbackDevice(deps, prepared.sourceName);
    if (!device) {
      await deps.releaseLoopback();
      return { error: "Luminor loopback did not appear in media devices" };
    }
    const stream = await deps.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: device.deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      },
      video: false,
    });
    return { stream };
  } catch (error) {
    await deps.releaseLoopback();
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function captureMicrophone(deps: MeetingsRecordingCaptureDeps): Promise<MediaStream> {
  return deps.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
    video: false,
  });
}

export async function captureMeetingsRecordingAudio(
  deps: MeetingsRecordingCaptureDeps,
): Promise<MeetingsRecordingCapture> {
  const loopback = await captureLoopbackStream(deps);
  let mic: MediaStream | null = null;
  try {
    mic = await captureMicrophone(deps);
  } catch (error) {
    if (!("stream" in loopback)) {
      throw new Error(error instanceof Error ? error.message : "Microphone unavailable");
    }
  }

  const systemStream = "stream" in loopback ? loopback.stream : null;
  const sources = [
    ...(systemStream ? [{ id: "system" as const, stream: systemStream }] : []),
    ...(mic ? [{ id: "mic" as const, stream: mic }] : []),
  ];
  if (sources.length === 0) {
    throw new Error("Audio recording produced no audio track");
  }

  let mixed: MeetingsMixedAudio | null = null;
  const output = (() => {
    if (sources.length === 1) {
      return sources[0]!.stream;
    }
    mixed = createMeetingsMixedAudioStream(sources, deps.audioContextCtor);
    return mixed.stream;
  })();

  const mode: MeetingsRecordingMode = systemStream ? "system+mic" : "mic";
  const degradation = systemStream === null ? MEETINGS_LOOPBACK_DEGRADATION : null;

  let stopped = false;
  return {
    stream: output,
    mode,
    degradation,
    async stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      mixed?.stop();
      stopStream(systemStream);
      stopStream(mic);
      if (systemStream) {
        await deps.releaseLoopback();
      }
    },
  };
}
