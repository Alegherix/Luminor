import { describe, expect, it } from "vitest";

import {
  attendeeInitials,
  displayMeetUrl,
  featuredMeetingSession,
  formatMeetingTimeRange,
  meetingCountdown,
  todaysScheduleSessions,
} from "./meetingsSchedule";
import {
  createIdleMeetingsWorkspace,
  type MeetingSession,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";

const NOW = new Date("2026-08-13T07:56:00.000Z");

function session(overrides: Partial<MeetingSession>): MeetingSession {
  return {
    id: "standup",
    title: "Standup – standardiza",
    startAt: "2026-08-13T08:00:00.000Z",
    endAt: "2026-08-13T08:30:00.000Z",
    meetUrl: "https://meet.google.com/abc-defg-hij",
    attendees: ["Ada Lovelace", "alan@example.com"],
    status: "upcoming",
    source: "calendar",
    ...overrides,
  };
}

function workspace(overrides: Partial<MeetingsWorkspaceSnapshot> = {}): MeetingsWorkspaceSnapshot {
  return {
    ...createIdleMeetingsWorkspace(),
    connection: "signed-in",
    ...overrides,
  };
}

describe("meetingCountdown", () => {
  it("labels a meeting a few minutes away", () => {
    expect(meetingCountdown(session({}), NOW)).toEqual({
      kind: "starts-in",
      badge: "Starts in 4 min",
      compact: "In 4 min",
    });
  });

  it("labels a live meeting", () => {
    expect(
      meetingCountdown(
        session({
          startAt: "2026-08-13T07:30:00.000Z",
          endAt: "2026-08-13T08:30:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({
      kind: "live",
      badge: "Live now",
      compact: "Live",
    });
  });

  it("labels an ended meeting", () => {
    expect(
      meetingCountdown(
        session({
          startAt: "2026-08-13T06:00:00.000Z",
          endAt: "2026-08-13T06:30:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({
      kind: "ended",
      badge: "Ended",
      compact: "Ended",
    });
  });
});

describe("featuredMeetingSession", () => {
  it("uses the selected upcoming meeting so its details and Join action are shown", () => {
    const later = session({ id: "later", title: "Retro", startAt: "2026-08-13T15:00:00.000Z" });
    const featured = featuredMeetingSession(
      workspace({
        selectedSessionId: "later",
        sessions: [session({}), later],
      }),
      NOW,
    );
    expect(featured?.id).toBe("later");
  });

  it("uses the next live or upcoming meeting when nothing is selected", () => {
    const featured = featuredMeetingSession(
      workspace({
        sessions: [
          session({
            id: "ended",
            title: "Yesterday leftover",
            startAt: "2026-08-13T06:00:00.000Z",
            endAt: "2026-08-13T06:30:00.000Z",
          }),
          session({}),
        ],
      }),
      NOW,
    );
    expect(featured?.id).toBe("standup");
  });
});

describe("todaysScheduleSessions", () => {
  it("lists remaining meetings before ended ones", () => {
    const rows = todaysScheduleSessions(
      workspace({
        sessions: [
          session({
            id: "ended",
            startAt: "2026-08-13T06:00:00.000Z",
            endAt: "2026-08-13T06:30:00.000Z",
          }),
          session({ id: "later", startAt: "2026-08-13T09:00:00.000Z" }),
          session({}),
        ],
      }),
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["standup", "later"]);
  });
});

describe("formatMeetingTimeRange", () => {
  it("joins start and end clocks", () => {
    const range = formatMeetingTimeRange(session({}));
    expect(range).toMatch(/–/);
    expect(range).not.toBeNull();
  });
});

describe("displayMeetUrl", () => {
  it("strips the protocol from a Meet link", () => {
    expect(displayMeetUrl("https://meet.google.com/abc-defg-hij")).toBe(
      "meet.google.com/abc-defg-hij",
    );
  });
});

describe("attendeeInitials", () => {
  it("uses the first letters of a display name", () => {
    expect(attendeeInitials("Ada Lovelace")).toBe("AL");
  });

  it("uses the local part of an email", () => {
    expect(attendeeInitials("alan@example.com")).toBe("AL");
  });
});
