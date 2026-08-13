import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMeetingsRecordingManager,
  meetingsRecordingDir,
  meetingsRecordingFilePath,
  sanitizeMeetingSessionId,
} from "./meetingsRecording";

const tempDirs = new Set<string>();

function makeTempDir(prefix: string): string {
  const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), prefix));
  tempDirs.add(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs) {
    FS.rmSync(directory, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe("meetings recording paths", () => {
  it("writes under the Luminor home meetings tree for that session", () => {
    expect(sanitizeMeetingSessionId("pasted:abc-defg-hij")).toBe("pasted_abc-defg-hij");
    expect(meetingsRecordingDir("/home/me/.luminor", "pasted:abc-defg-hij")).toBe(
      Path.join("/home/me/.luminor", "meetings", "pasted_abc-defg-hij", "recordings"),
    );
    expect(
      meetingsRecordingFilePath({
        homeDir: "/home/me/.luminor",
        sessionId: "pasted:abc-defg-hij",
        startedAt: new Date("2026-08-12T12:00:00.000Z"),
        recordingId: "rec1",
      }),
    ).toBe(
      Path.join(
        "/home/me/.luminor",
        "meetings",
        "pasted_abc-defg-hij",
        "recordings",
        "2026-08-12T12-00-00-000Z-rec1.webm",
      ),
    );
  });
});

describe("createMeetingsRecordingManager", () => {
  it("creates a recording file and appends chunks until stop", async () => {
    const homeDir = makeTempDir("luminor-meetings-rec-");
    const manager = createMeetingsRecordingManager({
      homeDir,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      randomId: () => "tape01",
    });

    const started = await manager.start("pasted:abc-defg-hij");
    expect(started.status).toBe("recording");
    expect(started.sessionId).toBe("pasted:abc-defg-hij");
    expect(started.filePath).toBe(
      Path.join(
        homeDir,
        "meetings",
        "pasted_abc-defg-hij",
        "recordings",
        "2026-08-12T12-00-00-000Z-tape01.webm",
      ),
    );

    manager.append(new Uint8Array([1, 2, 3, 4]));
    await manager.stop();

    expect(FS.readFileSync(started.filePath ?? "", { encoding: null })).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
    expect(manager.getState().status).toBe("idle");
  });

  it("reuses the open file when start is called again for the same session", async () => {
    const homeDir = makeTempDir("luminor-meetings-rec-");
    const manager = createMeetingsRecordingManager({
      homeDir,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      randomId: () => "tape01",
    });

    const first = await manager.start("live");
    const second = await manager.start("live");
    expect(second.filePath).toBe(first.filePath);
    await manager.stop();
  });
});
