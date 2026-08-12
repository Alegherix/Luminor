import { describe, expect, it } from "vitest";

import {
  createIdleMeetingsWorkspace,
  createMeetingsWorkspace,
  meetingsSidebarSections,
  selectedMeetingSession,
  type MeetingsCalendarEvent,
  type MeetingsCalendarHost,
} from "./meetingsWorkspace";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function event(
  overrides: Partial<MeetingsCalendarEvent> & Pick<MeetingsCalendarEvent, "id">,
): MeetingsCalendarEvent {
  return {
    title: overrides.title ?? overrides.id,
    startAt: overrides.startAt ?? "2026-08-12T13:00:00.000Z",
    endAt: overrides.endAt ?? "2026-08-12T13:30:00.000Z",
    meetUrl: overrides.meetUrl ?? null,
    attendees: overrides.attendees ?? [],
    ...overrides,
  };
}

function fakeCalendar(input: {
  connected?: boolean;
  accountEmail?: string | null;
  events?: MeetingsCalendarEvent[];
}): MeetingsCalendarHost & { events: MeetingsCalendarEvent[] } {
  const host = {
    events: input.events ?? [],
    connected: input.connected ?? false,
    accountEmail: input.accountEmail ?? null,
    async getStatus() {
      return { connected: host.connected, accountEmail: host.accountEmail };
    },
    async connect() {
      host.connected = true;
      host.accountEmail = input.accountEmail ?? "me@example.com";
      return { connected: true, accountEmail: host.accountEmail };
    },
    async listToday() {
      return host.events;
    },
  };
  return host;
}

describe("createIdleMeetingsWorkspace", () => {
  it("starts signed out with no selected meeting and empty today, live, and ended sections", () => {
    const workspace = createIdleMeetingsWorkspace();

    expect(workspace.connection).toBe("signed-out");
    expect(selectedMeetingSession(workspace)).toBeNull();
    expect(meetingsSidebarSections(workspace, NOW)).toEqual({
      live: [],
      today: [],
      ended: [],
    });
  });
});

describe("meetingsSidebarSections", () => {
  it("groups today as live, remaining upcoming, and ended", () => {
    const workspace = createIdleMeetingsWorkspace();
    const snapshot = {
      ...workspace,
      connection: "signed-in" as const,
      sessions: [
        {
          id: "ended",
          title: "Standup",
          startAt: "2026-08-12T09:00:00.000Z",
          endAt: "2026-08-12T09:30:00.000Z",
          meetUrl: "https://meet.google.com/ended",
          attendees: [],
          status: "ended" as const,
        },
        {
          id: "live",
          title: "Interview",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://meet.google.com/live",
          attendees: [],
          status: "live" as const,
        },
        {
          id: "later",
          title: "Retro",
          startAt: "2026-08-12T15:00:00.000Z",
          endAt: "2026-08-12T15:45:00.000Z",
          meetUrl: null,
          attendees: [],
          status: "upcoming" as const,
        },
      ],
    };

    expect(meetingsSidebarSections(snapshot, NOW)).toEqual({
      live: [snapshot.sessions[1]],
      today: [snapshot.sessions[2]],
      ended: [snapshot.sessions[0]],
    });
  });

  it("promotes the next upcoming meeting into live when nothing is currently live", () => {
    const workspace = createIdleMeetingsWorkspace();
    const next = {
      id: "next",
      title: "Next",
      startAt: "2026-08-12T13:00:00.000Z",
      endAt: "2026-08-12T13:30:00.000Z",
      meetUrl: null,
      attendees: [],
      status: "upcoming" as const,
    };
    const later = {
      id: "later",
      title: "Later",
      startAt: "2026-08-12T16:00:00.000Z",
      endAt: "2026-08-12T16:30:00.000Z",
      meetUrl: null,
      attendees: [],
      status: "upcoming" as const,
    };
    const snapshot = {
      ...workspace,
      connection: "signed-in" as const,
      sessions: [later, next],
    };

    expect(meetingsSidebarSections(snapshot, NOW)).toEqual({
      live: [next],
      today: [later],
      ended: [],
    });
  });
});

describe("createMeetingsWorkspace", () => {
  it("stays signed out until calendar connect succeeds", async () => {
    const calendar = fakeCalendar({ connected: false });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar });

    await workspace.hydrate();

    expect(workspace.getSnapshot().connection).toBe("signed-out");
    expect(meetingsSidebarSections(workspace.getSnapshot(), NOW)).toEqual({
      live: [],
      today: [],
      ended: [],
    });
  });

  it("loads today's primary-calendar events after connect and refresh", async () => {
    const calendar = fakeCalendar({
      events: [
        event({
          id: "live",
          title: "Interview",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://meet.google.com/live",
        }),
        event({
          id: "later",
          title: "Retro",
          startAt: "2026-08-12T15:00:00.000Z",
          endAt: "2026-08-12T15:45:00.000Z",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar });

    await workspace.connect();

    const snapshot = workspace.getSnapshot();
    expect(snapshot.connection).toBe("signed-in");
    expect(snapshot.accountEmail).toBe("me@example.com");
    expect(snapshot.sessions.map((session) => session.id)).toEqual(["live", "later"]);
    expect(meetingsSidebarSections(snapshot, NOW).live[0]?.title).toBe("Interview");
    expect(meetingsSidebarSections(snapshot, NOW).today[0]?.title).toBe("Retro");
  });

  it("selects a session so the selected-meeting card can render it", async () => {
    const calendar = fakeCalendar({
      connected: true,
      events: [event({ id: "later", title: "Retro" })],
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar });
    await workspace.hydrate();

    workspace.selectSession("later");

    expect(selectedMeetingSession(workspace.getSnapshot())?.title).toBe("Retro");
  });

  it("keeps the selected session across refresh and drops it when the event disappears", async () => {
    const calendar = fakeCalendar({
      connected: true,
      events: [event({ id: "later", title: "Retro" }), event({ id: "other", title: "Other" })],
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar });
    await workspace.hydrate();
    workspace.selectSession("later");

    calendar.events = [event({ id: "later", title: "Retro (updated)" })];
    await workspace.refresh();
    expect(selectedMeetingSession(workspace.getSnapshot())?.title).toBe("Retro (updated)");

    calendar.events = [event({ id: "other", title: "Other" })];
    await workspace.refresh();
    expect(selectedMeetingSession(workspace.getSnapshot())).toBeNull();
  });
});
