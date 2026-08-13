import { describe, expect, it, vi } from "vitest";

import { createDesktopMeetingsRecordingHost } from "./desktopMeetingsRecording";
import { MEETINGS_LOOPBACK_DEGRADATION } from "./meetingsWorkspace";

function fakeStream(label: string): MediaStream {
  const track = { kind: "audio", label, stop: vi.fn() };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

class FakeAudioContext {
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createMediaStreamDestination() {
    return { stream: fakeStream("mix") };
  }
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  async close() {}
}

class FakeMediaRecorder {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onstop?.();
  });
}

describe("createDesktopMeetingsRecordingHost", () => {
  it("starts a file-backed system+mic recording on join", async () => {
    const filePath = "/tmp/luminor-home/meetings/pasted_abc-defg-hij/recordings/tape.webm";
    const meetings = {
      startRecording: vi.fn(async () => ({
        status: "recording" as const,
        mode: null,
        sessionId: "pasted:abc-defg-hij",
        filePath,
        degradation: null,
      })),
      appendRecordingChunk: vi.fn(async () => undefined),
      stopRecording: vi.fn(async () => ({
        status: "idle" as const,
        mode: null,
        sessionId: null,
        filePath: null,
        degradation: null,
      })),
      getRecordingState: vi.fn(async () => ({
        status: "idle" as const,
        mode: null,
        sessionId: null,
        filePath: null,
        degradation: null,
      })),
      prepareLoopback: vi.fn(async () => ({
        ok: true,
        sourceName: "luminor_loopback_9",
        moduleId: "12",
      })),
      releaseLoopback: vi.fn(async () => undefined),
    };
    const host = createDesktopMeetingsRecordingHost({
      meetings: () => meetings as never,
      mediaDevices: {
        enumerateDevices: async () => [
          { deviceId: "loop-dev", kind: "audioinput", label: "luminor_loopback_9" },
        ],
        getUserMedia: async (constraints) =>
          typeof constraints.audio === "object" &&
          constraints.audio &&
          "deviceId" in constraints.audio
            ? fakeStream("loop")
            : fakeStream("mic"),
      },
      mediaRecorderCtor: FakeMediaRecorder,
      audioContextCtor: FakeAudioContext as never,
      now: () => 0,
      sleep: async () => undefined,
    });

    const started = await host.start("pasted:abc-defg-hij");

    expect(meetings.startRecording).toHaveBeenCalledWith({ sessionId: "pasted:abc-defg-hij" });
    expect(started).toEqual({
      status: "recording",
      mode: "system+mic",
      sessionId: "pasted:abc-defg-hij",
      filePath,
      degradation: null,
    });

    await host.stop();
    expect(meetings.stopRecording).toHaveBeenCalledTimes(1);
    expect(await host.getState()).toEqual({
      status: "idle",
      mode: null,
      sessionId: null,
      filePath: null,
      degradation: null,
    });
  });

  it("keeps recording as mic-only when loopback fails", async () => {
    const filePath = "/tmp/luminor-home/meetings/live/recordings/tape.webm";
    const meetings = {
      startRecording: vi.fn(async () => ({
        status: "recording" as const,
        mode: null,
        sessionId: "live",
        filePath,
        degradation: null,
      })),
      appendRecordingChunk: vi.fn(async () => undefined),
      stopRecording: vi.fn(async () => ({
        status: "idle" as const,
        mode: null,
        sessionId: null,
        filePath: null,
        degradation: null,
      })),
      getRecordingState: vi.fn(),
      prepareLoopback: vi.fn(async () => ({ ok: false, error: "pactl unavailable" })),
      releaseLoopback: vi.fn(async () => undefined),
    };
    const host = createDesktopMeetingsRecordingHost({
      meetings: () => meetings as never,
      mediaDevices: {
        enumerateDevices: async () => [],
        getUserMedia: async () => fakeStream("mic"),
      },
      mediaRecorderCtor: FakeMediaRecorder,
    });

    await expect(host.start("live")).resolves.toEqual({
      status: "recording",
      mode: "mic",
      sessionId: "live",
      filePath,
      degradation: MEETINGS_LOOPBACK_DEGRADATION,
    });
  });
});
