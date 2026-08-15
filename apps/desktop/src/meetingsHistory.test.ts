import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  discoverMeetingsHistoryRoots,
  findHistoryTranscriptPath,
  listMeetingsHistory,
  resolveMeetingSessionDir,
} from "./meetingsHistory";

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

function writeFile(path: string, contents: string): void {
  FS.mkdirSync(Path.dirname(path), { recursive: true });
  FS.writeFileSync(path, contents);
}

describe("discoverMeetingsHistoryRoots", () => {
  it("includes the Luminor home meetings tree and legacy MissionDeck profiles", () => {
    const homeDir = makeTempDir("luminor-home-");
    const userHome = makeTempDir("user-home-");
    const xdg = Path.join(userHome, ".config");
    FS.mkdirSync(Path.join(homeDir, "meetings"), { recursive: true });
    FS.mkdirSync(Path.join(xdg, "@missiondeck", "desktop", "meetings"), { recursive: true });
    FS.mkdirSync(Path.join(xdg, "@missiondeck", "desktop-dev", "MissionDeck-prod", "meetings"), {
      recursive: true,
    });

    expect(
      discoverMeetingsHistoryRoots({
        homeDir,
        userHome,
        env: { XDG_CONFIG_HOME: xdg },
      }),
    ).toEqual([
      Path.join(homeDir, "meetings"),
      Path.join(xdg, "@missiondeck", "desktop", "meetings"),
      Path.join(xdg, "@missiondeck", "desktop-dev", "MissionDeck-prod", "meetings"),
    ]);
  });
});

describe("listMeetingsHistory", () => {
  it("reads Luminor session folders and MissionDeck recording metadata", async () => {
    const homeDir = makeTempDir("luminor-home-");
    const userHome = makeTempDir("user-home-");
    const xdg = Path.join(userHome, ".config");
    const luminorSession = Path.join(homeDir, "meetings", "pasted_abc-defg-hij");
    writeFile(Path.join(luminorSession, "transcripts", "transcript.txt"), "Hello from Luminor.\n");
    writeFile(
      Path.join(luminorSession, "recordings", "2026-08-11T07-00-00-000Z-rec-aaaa.webm"),
      "webm",
    );

    const missionSession = Path.join(
      xdg,
      "@missiondeck",
      "desktop-dev",
      "MissionDeck-prod",
      "meetings",
      "gcal-k8o54s99u9ik989i0o8fuuehfp_20260812T060000Z-20260812T060000Z",
    );
    writeFile(
      Path.join(missionSession, "recordings", "rec.metadata.json"),
      `${JSON.stringify({
        sessionId: "gcal-k8o54s99u9ik989i0o8fuuehfp_20260812T060000Z-20260812T060000Z",
        meetingTitle: "Standup - standardize",
        meetingStartAt: "2026-08-12T08:00:00+02:00",
        meetingEndAt: "2026-08-12T08:25:00+02:00",
        meetingMeetUrl: "https://meet.google.com/ikn-octf-haj",
      })}\n`,
    );
    writeFile(Path.join(missionSession, "recordings", "rec.webm"), "webm");
    writeFile(Path.join(missionSession, "transcripts", "live.json"), '{"segments":[]}\n');

    const junk = Path.join(
      xdg,
      "@missiondeck",
      "desktop-dev",
      "MissionDeck-prod",
      "meetings",
      "m-meeting-a",
    );
    writeFile(Path.join(junk, "recordings", "noise.webm"), "webm");

    const events = await listMeetingsHistory({
      homeDir,
      userHome,
      env: { XDG_CONFIG_HOME: xdg },
    });

    expect(events.map((event) => event.title)).toEqual(["Standup - standardize", "Pasted meeting"]);
    expect(events[0]).toEqual({
      id: "gcal-k8o54s99u9ik989i0o8fuuehfp_20260812T060000Z-20260812T060000Z",
      title: "Standup - standardize",
      startAt: "2026-08-12T06:00:00.000Z",
      endAt: "2026-08-12T06:25:00.000Z",
      meetUrl: "https://meet.google.com/ikn-octf-haj",
      attendees: [],
    });
  });

  it("keeps recurring meetings that share a Meet URL on different days", async () => {
    const homeDir = makeTempDir("luminor-home-");
    const root = Path.join(homeDir, "meetings");
    for (const [folder, start] of [
      ["gcal-standup_20260810T060000Z", "2026-08-10T08:00:00+02:00"],
      ["gcal-standup_20260812T060000Z", "2026-08-12T08:00:00+02:00"],
    ] as const) {
      writeFile(
        Path.join(root, folder, "recordings", "rec.metadata.json"),
        `${JSON.stringify({
          sessionId: folder,
          meetingTitle: "Standup",
          meetingStartAt: start,
          meetingEndAt: start,
          meetingMeetUrl: "https://meet.google.com/ikn-octf-haj",
        })}\n`,
      );
      writeFile(Path.join(root, folder, "recordings", "rec.webm"), "webm");
    }

    const events = await listMeetingsHistory({ homeDir, userHome: makeTempDir("user-home-") });
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.id)).toEqual([
      "gcal-standup_20260812T060000Z",
      "gcal-standup_20260810T060000Z",
    ]);
  });

  it("deduplicates the same session copied into two roots by keeping the richer folder", async () => {
    const homeDir = makeTempDir("luminor-home-");
    const userHome = makeTempDir("user-home-");
    const xdg = Path.join(userHome, ".config");
    const id = "gcal-shared_20260812T060000Z";
    writeFile(
      Path.join(homeDir, "meetings", id, "recordings", "rec.metadata.json"),
      `${JSON.stringify({
        sessionId: id,
        meetingTitle: "Shared",
        meetingStartAt: "2026-08-12T06:00:00.000Z",
        meetingEndAt: "2026-08-12T06:30:00.000Z",
      })}\n`,
    );
    writeFile(Path.join(homeDir, "meetings", id, "recordings", "rec.webm"), "webm");
    writeFile(
      Path.join(xdg, "@missiondeck", "desktop", "meetings", id, "recordings", "rec.metadata.json"),
      `${JSON.stringify({
        sessionId: id,
        meetingTitle: "Shared",
        meetingStartAt: "2026-08-12T06:00:00.000Z",
        meetingEndAt: "2026-08-12T06:30:00.000Z",
      })}\n`,
    );
    writeFile(
      Path.join(xdg, "@missiondeck", "desktop", "meetings", id, "transcripts", "transcript.txt"),
      "Richer copy.\n",
    );

    const events = await listMeetingsHistory({
      homeDir,
      userHome,
      env: { XDG_CONFIG_HOME: xdg },
    });
    expect(events).toHaveLength(1);
    expect(
      resolveMeetingSessionDir({
        homeDir,
        sessionId: id,
        userHome,
        env: { XDG_CONFIG_HOME: xdg },
      }),
    ).toBe(Path.join(xdg, "@missiondeck", "desktop", "meetings", id));
    expect(
      findHistoryTranscriptPath(Path.join(xdg, "@missiondeck", "desktop", "meetings", id)),
    ).toBe(
      Path.join(xdg, "@missiondeck", "desktop", "meetings", id, "transcripts", "transcript.txt"),
    );
  });
});
