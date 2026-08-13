import { describe, expect, it, vi } from "vitest";

import { captureMeetingsRecordingAudio } from "./meetingsRecordingCapture";
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

describe("captureMeetingsRecordingAudio", () => {
  it("captures loopback plus microphone without a source picker", async () => {
    const loopbackStream = fakeStream("Luminor_Loopback");
    const micStream = fakeStream("Microphone");
    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const audio = constraints.audio;
      if (typeof audio === "object" && audio && "deviceId" in audio) {
        return loopbackStream;
      }
      return micStream;
    });
    const prepareLoopback = vi.fn(async () => ({
      ok: true as const,
      sourceName: "luminor_loopback_9",
      moduleId: "12",
    }));
    const releaseLoopback = vi.fn(async () => undefined);

    const capture = await captureMeetingsRecordingAudio({
      prepareLoopback,
      releaseLoopback,
      mediaDevices: {
        enumerateDevices: async () => [
          { deviceId: "loop-dev", kind: "audioinput", label: "luminor_loopback_9" },
          { deviceId: "mic-dev", kind: "audioinput", label: "Built-in Mic" },
        ],
        getUserMedia,
      },
      now: () => 0,
      sleep: async () => undefined,
      audioContextCtor: FakeAudioContext as never,
    });

    expect(capture.mode).toBe("system+mic");
    expect(capture.degradation).toBeNull();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({ deviceId: { exact: "loop-dev" } }),
        video: false,
      }),
    );
    expect(JSON.stringify(getUserMedia.mock.calls)).not.toMatch(/display|picker/i);
    await capture.stop();
    expect(releaseLoopback).toHaveBeenCalledTimes(1);
  });

  it("falls back to microphone-only when loopback cannot start", async () => {
    const micStream = fakeStream("Microphone");
    const capture = await captureMeetingsRecordingAudio({
      prepareLoopback: async () => ({ ok: false, error: "pactl unavailable" }),
      releaseLoopback: vi.fn(async () => undefined),
      mediaDevices: {
        enumerateDevices: async () => [],
        getUserMedia: async () => micStream,
      },
    });

    expect(capture.mode).toBe("mic");
    expect(capture.degradation).toBe(MEETINGS_LOOPBACK_DEGRADATION);
    expect(capture.stream).toBe(micStream);
  });
});
