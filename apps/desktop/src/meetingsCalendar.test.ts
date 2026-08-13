import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMeetingsCalendarService,
  localDayRange,
  mapPrimaryCalendarEvents,
  parseInstalledGoogleOAuthClient,
  type MeetingsCalendarRawEvent,
  type MeetingsCalendarTokenSet,
} from "./meetingsCalendar";
import { HttpMeetingsCalendarClient } from "./meetingsCalendarOauth";

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

const INSTALLED_CLIENT = {
  installed: {
    client_id: "desktop.apps.googleusercontent.com",
    client_secret: "desktop-client-secret",
    redirect_uris: ["http://localhost"],
  },
};

function modeBits(mode: number): number {
  return mode & 0o777;
}

function writeInstalledClient(directory: string): string {
  const filePath = Path.join(directory, "client.json");
  FS.writeFileSync(filePath, `${JSON.stringify(INSTALLED_CLIENT, null, 2)}\n`, "utf8");
  return filePath;
}

function makeToken(overrides: Partial<MeetingsCalendarTokenSet> = {}): MeetingsCalendarTokenSet {
  return {
    accessToken: "access-token-luminor",
    refreshToken: "refresh-token-luminor",
    expiresAt: "2026-08-12T13:00:00.000Z",
    scope: "https://www.googleapis.com/auth/calendar.events.readonly",
    tokenType: "Bearer",
    accountEmail: "me@example.com",
    ...overrides,
  };
}

describe("parseInstalledGoogleOAuthClient", () => {
  it("accepts an installed-app client JSON", () => {
    expect(parseInstalledGoogleOAuthClient(INSTALLED_CLIENT)).toEqual({
      clientId: "desktop.apps.googleusercontent.com",
      clientSecret: "desktop-client-secret",
    });
  });

  it("rejects a web client JSON", () => {
    expect(() =>
      parseInstalledGoogleOAuthClient({
        web: {
          client_id: "web.apps.googleusercontent.com",
          client_secret: "web-secret",
        },
      }),
    ).toThrow(/installed/i);
  });
});

describe("createMeetingsCalendarService", () => {
  it("copies a picked installed-client JSON into Luminor config with restricted permissions", async () => {
    if (process.platform === "win32") return;
    const homeDir = makeTempDir("luminor-meetings-home-");
    const downloads = makeTempDir("luminor-meetings-download-");
    const pickedPath = writeInstalledClient(downloads);
    const service = createMeetingsCalendarService({
      homeDir,
      pickClientJson: async () => pickedPath,
      authorize: async () => ({
        code: "oauth-code",
        redirectUri: "http://localhost:9999/callback",
        codeVerifier: "verifier",
      }),
      oauthClient: {
        exchangeCode: async () => makeToken(),
        refreshToken: async () => makeToken(),
      },
      calendarClient: {
        listEvents: async () => [],
      },
    });

    await service.connect();

    const copiedPath = Path.join(homeDir, "config", "google-calendar-oauth.json");
    expect(FS.readFileSync(copiedPath, "utf8")).toContain("desktop.apps.googleusercontent.com");
    expect(modeBits(FS.statSync(Path.dirname(copiedPath)).mode)).toBe(0o700);
    expect(modeBits(FS.statSync(copiedPath).mode)).toBe(0o600);
    expect(FS.readFileSync(pickedPath, "utf8")).toContain("desktop-client-secret");
  });

  it("stores tokens under Luminor home and never reads Mission Deck userData", async () => {
    const homeDir = makeTempDir("luminor-meetings-home-");
    const missionDeckUserData = makeTempDir("missiondeck-userdata-");
    FS.mkdirSync(Path.join(missionDeckUserData, "auth"), { recursive: true });
    FS.writeFileSync(
      Path.join(missionDeckUserData, "auth", "google-calendar-tokens.json"),
      JSON.stringify({ accessToken: "mission-deck-token" }),
      "utf8",
    );
    const pickedPath = writeInstalledClient(makeTempDir("luminor-meetings-download-"));
    const service = createMeetingsCalendarService({
      homeDir,
      pickClientJson: async () => pickedPath,
      authorize: async () => ({
        code: "oauth-code",
        redirectUri: "http://localhost:9999/callback",
        codeVerifier: "verifier",
      }),
      oauthClient: {
        exchangeCode: async () => makeToken(),
        refreshToken: async () => makeToken(),
      },
      calendarClient: {
        listEvents: async () => [],
      },
    });

    const status = await service.connect();

    expect(status.connected).toBe(true);
    expect(status.accountEmail).toBe("me@example.com");
    const tokenPath = Path.join(homeDir, "auth", "google-calendar-tokens.json");
    expect(FS.readFileSync(tokenPath, "utf8")).toContain("refresh-token-luminor");
    expect(FS.readFileSync(tokenPath, "utf8")).not.toContain("mission-deck-token");
    expect(JSON.stringify(status)).not.toContain("refresh-token-luminor");
  });

  it("lists only the primary calendar for today", async () => {
    const homeDir = makeTempDir("luminor-meetings-home-");
    const pickedPath = writeInstalledClient(makeTempDir("luminor-meetings-download-"));
    const listEvents = vi.fn(async () => [
      {
        id: "evt-1",
        summary: "Interview",
        status: "confirmed",
        start: { dateTime: "2026-08-12T11:30:00.000Z" },
        end: { dateTime: "2026-08-12T12:30:00.000Z" },
        hangoutLink: "https://meet.google.com/live",
      },
    ]);
    const service = createMeetingsCalendarService({
      homeDir,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      pickClientJson: async () => pickedPath,
      authorize: async () => ({
        code: "oauth-code",
        redirectUri: "http://localhost:9999/callback",
        codeVerifier: "verifier",
      }),
      oauthClient: {
        exchangeCode: async () => makeToken(),
        refreshToken: async () => makeToken(),
      },
      calendarClient: {
        listEvents,
      },
    });
    await service.connect();

    const events = await service.listToday();

    expect(listEvents).toHaveBeenCalledWith({
      accessToken: "access-token-luminor",
      calendarId: "primary",
      ...localDayRange(new Date("2026-08-12T12:00:00.000Z")),
    });
    expect(events).toEqual([
      {
        id: "evt-1",
        title: "Interview",
        startAt: "2026-08-12T11:30:00.000Z",
        endAt: "2026-08-12T12:30:00.000Z",
        meetUrl: "https://meet.google.com/live",
        attendees: [],
      },
    ]);
  });

  it("picks the installed-client JSON only once when Luminor already has a copy", async () => {
    const homeDir = makeTempDir("luminor-meetings-home-");
    const pickedPath = writeInstalledClient(makeTempDir("luminor-meetings-download-"));
    const pickClientJson = vi.fn(async () => pickedPath);
    const service = createMeetingsCalendarService({
      homeDir,
      pickClientJson,
      authorize: async () => ({
        code: "oauth-code",
        redirectUri: "http://localhost:9999/callback",
        codeVerifier: "verifier",
      }),
      oauthClient: {
        exchangeCode: async () => makeToken(),
        refreshToken: async () => makeToken(),
      },
      calendarClient: {
        listEvents: async () => [],
      },
    });

    await service.connect();
    await service.connect();

    expect(pickClientJson).toHaveBeenCalledTimes(1);
  });

  it("returns signed-out status before a grant exists", async () => {
    const service = createMeetingsCalendarService({
      homeDir: makeTempDir("luminor-meetings-home-"),
    });

    await expect(service.getStatus()).resolves.toEqual({
      connected: false,
      accountEmail: null,
    });
  });
});

describe("HttpMeetingsCalendarClient", () => {
  it("requests only the primary calendar", async () => {
    const fetchLike = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    }));
    const client = new HttpMeetingsCalendarClient(fetchLike as unknown as typeof fetch);

    await client.listEvents({
      accessToken: "access-token-luminor",
      calendarId: "primary",
      timeMin: "2026-08-12T00:00:00.000Z",
      timeMax: "2026-08-13T00:00:00.000Z",
    });

    expect(fetchLike).toHaveBeenCalledWith(
      expect.stringContaining("/calendars/primary/events"),
      expect.anything(),
    );
    expect(fetchLike).not.toHaveBeenCalledWith(
      expect.stringContaining("/users/me/calendarList"),
      expect.anything(),
    );
  });
});

describe("mapPrimaryCalendarEvents", () => {
  it("keeps timed events, including those without Meet, and drops cancelled and all-day items", () => {
    const events: MeetingsCalendarRawEvent[] = [
      {
        id: "cancelled",
        summary: "Cancelled",
        status: "cancelled",
        start: { dateTime: "2026-08-12T09:00:00.000Z" },
        end: { dateTime: "2026-08-12T09:30:00.000Z" },
      },
      {
        id: "all-day",
        summary: "Holiday",
        status: "confirmed",
        start: { date: "2026-08-12" },
        end: { date: "2026-08-13" },
      },
      {
        id: "no-meet",
        summary: "Desk time",
        status: "confirmed",
        start: { dateTime: "2026-08-12T10:00:00.000Z" },
        end: { dateTime: "2026-08-12T10:30:00.000Z" },
      },
    ];

    expect(mapPrimaryCalendarEvents(events)).toEqual([
      {
        id: "no-meet",
        title: "Desk time",
        startAt: "2026-08-12T10:00:00.000Z",
        endAt: "2026-08-12T10:30:00.000Z",
        meetUrl: null,
        attendees: [],
      },
    ]);
  });

  it("keeps a non-Meet conference URL so the workspace can open it externally", () => {
    expect(
      mapPrimaryCalendarEvents([
        {
          id: "zoom",
          summary: "Vendor call",
          status: "confirmed",
          start: { dateTime: "2026-08-12T11:30:00.000Z" },
          end: { dateTime: "2026-08-12T12:30:00.000Z" },
          conferenceData: {
            conferenceSolution: { key: { type: "addOn" } },
            entryPoints: [{ entryPointType: "video", uri: "https://zoom.us/j/123" }],
          },
        },
      ]),
    ).toEqual([
      {
        id: "zoom",
        title: "Vendor call",
        startAt: "2026-08-12T11:30:00.000Z",
        endAt: "2026-08-12T12:30:00.000Z",
        meetUrl: "https://zoom.us/j/123",
        attendees: [],
      },
    ]);
  });
});
