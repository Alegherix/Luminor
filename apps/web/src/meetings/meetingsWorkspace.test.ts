import { describe, expect, it } from "vitest";

import {
  computeMeetingReminders,
  createIdleMeetingsWorkspace,
  createMeetingsWorkspace,
  meetingReminderFiredKey,
  meetingRowOffersJoin,
  MEETING_JOIN_AVAILABLE_WINDOW_MS,
  MEETING_STARTING_WINDOW_MS,
  meetingsSidebarSections,
  meetingsSurfaceJoined,
  selectedMeetingSession,
  type MeetingsCalendarEvent,
  type MeetingsCalendarHost,
  type MeetingsEmbedHost,
  type MeetingsEmbedState,
} from "./meetingsWorkspace";
import { INVALID_MEET_URL_MESSAGE } from "./meetUrl";

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
          source: "calendar" as const,
        },
        {
          id: "live",
          title: "Interview",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://meet.google.com/live",
          attendees: [],
          status: "live" as const,
          source: "calendar" as const,
        },
        {
          id: "later",
          title: "Retro",
          startAt: "2026-08-12T15:00:00.000Z",
          endAt: "2026-08-12T15:45:00.000Z",
          meetUrl: null,
          attendees: [],
          status: "upcoming" as const,
          source: "calendar" as const,
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
      source: "calendar" as const,
    };
    const later = {
      id: "later",
      title: "Later",
      startAt: "2026-08-12T16:00:00.000Z",
      endAt: "2026-08-12T16:30:00.000Z",
      meetUrl: null,
      attendees: [],
      status: "upcoming" as const,
      source: "calendar" as const,
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

function fakeEmbed(): MeetingsEmbedHost & {
  calls: string[];
  state: MeetingsEmbedState;
} {
  const host = {
    calls: [] as string[],
    state: { joined: false, visible: false, url: null } as MeetingsEmbedState,
    async join(url: string) {
      host.calls.push(`join:${url}`);
      host.state = { joined: true, visible: true, url };
      return host.state;
    },
    async hide() {
      host.calls.push("hide");
      host.state = { ...host.state, visible: false };
      return host.state;
    },
    async show() {
      host.calls.push("show");
      host.state = { ...host.state, visible: host.state.joined };
      return host.state;
    },
    async leave() {
      host.calls.push("leave");
      host.state = { joined: false, visible: false, url: null };
      return host.state;
    },
    async getState() {
      host.calls.push("getState");
      return host.state;
    },
  };
  return host;
}

describe("meetings join and leave", () => {
  it("rejects an invalid pasted URL without joining", async () => {
    const embed = fakeEmbed();
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed });

    await workspace.joinPastedUrl("https://zoom.us/j/123");

    expect(workspace.getSnapshot().joinError).toBe(INVALID_MEET_URL_MESSAGE);
    expect(workspace.getSnapshot().sessions).toEqual([]);
    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(false);
    expect(embed.calls).toEqual([]);
  });

  it("joins a pasted Meet URL, adds it to today's list, and keeps it across calendar refresh", async () => {
    const embed = fakeEmbed();
    const calendar = fakeCalendar({
      connected: true,
      events: [event({ id: "later", title: "Retro" })],
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar, embed });
    await workspace.hydrate();

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");

    const joined = workspace.getSnapshot();
    expect(joined.joinError).toBeNull();
    expect(joined.joinedSessionId).toBe("pasted:abc-defg-hij");
    expect(joined.embedVisible).toBe(true);
    expect(joined.sessions.some((session) => session.id === "pasted:abc-defg-hij")).toBe(true);
    expect(
      meetingsSidebarSections(joined, NOW).live.some(
        (session) => session.id === "pasted:abc-defg-hij",
      ),
    ).toBe(true);
    expect(embed.calls).toEqual(["getState", "join:https://meet.google.com/abc-defg-hij"]);

    await workspace.refresh();
    expect(workspace.getSnapshot().sessions.map((session) => session.id)).toContain(
      "pasted:abc-defg-hij",
    );
    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(true);
  });

  it("joins the selected calendar event Meet URL", async () => {
    const embed = fakeEmbed();
    const calendar = fakeCalendar({
      connected: true,
      events: [
        event({
          id: "live",
          title: "Interview",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://meet.google.com/abc-defg-hij",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar, embed });
    await workspace.hydrate();
    workspace.selectSession("live");

    await workspace.joinSession("live");

    expect(workspace.getSnapshot().joinedSessionId).toBe("live");
    expect(embed.calls).toEqual(["getState", "join:https://meet.google.com/abc-defg-hij"]);
  });

  it("hides the embed without leaving and restores it on show; leave is the only destroy", async () => {
    const embed = fakeEmbed();
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed });
    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");

    await workspace.hideEmbed();
    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(true);
    expect(workspace.getSnapshot().embedVisible).toBe(false);
    expect(embed.calls).toEqual(["join:https://meet.google.com/abc-defg-hij", "hide"]);
    expect(embed.state.joined).toBe(true);

    await workspace.showEmbed();
    expect(workspace.getSnapshot().embedVisible).toBe(true);
    expect(embed.calls).toEqual(["join:https://meet.google.com/abc-defg-hij", "hide", "show"]);
    expect(embed.state.joined).toBe(true);

    await workspace.leave();
    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(false);
    expect(workspace.getSnapshot().embedVisible).toBe(false);
    expect(embed.calls).toEqual([
      "join:https://meet.google.com/abc-defg-hij",
      "hide",
      "show",
      "leave",
    ]);
    expect(embed.state.joined).toBe(false);
    expect(meetingsSidebarSections(workspace.getSnapshot(), NOW).ended[0]?.id).toBe(
      "pasted:abc-defg-hij",
    );
  });
});

describe("computeMeetingReminders", () => {
  const meetUrl = "https://meet.google.com/abc-defg-hij";

  it("fires meeting.starting from 10 minutes before start until the join window", () => {
    const session = {
      id: "standup",
      title: "Standup",
      startAt: "2026-08-12T12:10:00.000Z",
      endAt: "2026-08-12T12:40:00.000Z",
      meetUrl,
      attendees: [],
      status: "upcoming" as const,
      source: "calendar" as const,
    };

    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date("2026-08-12T12:00:00.000Z"),
        alreadyFired: new Set(),
      }).map((reminder) => reminder.kind),
    ).toEqual(["meeting.starting"]);
    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date("2026-08-12T12:07:59.000Z"),
        alreadyFired: new Set(),
      }).map((reminder) => reminder.kind),
    ).toEqual(["meeting.starting"]);
    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date(Date.parse(session.startAt) - MEETING_STARTING_WINDOW_MS - 1),
        alreadyFired: new Set(),
      }),
    ).toEqual([]);
  });

  it("fires meeting.join_available from 2 minutes before start until the meeting ends", () => {
    const session = {
      id: "standup",
      title: "Standup",
      startAt: "2026-08-12T12:10:00.000Z",
      endAt: "2026-08-12T12:40:00.000Z",
      meetUrl,
      attendees: [],
      status: "upcoming" as const,
      source: "calendar" as const,
    };

    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date(Date.parse(session.startAt) - MEETING_JOIN_AVAILABLE_WINDOW_MS),
        alreadyFired: new Set(),
      }).map((reminder) => reminder.kind),
    ).toEqual(["meeting.join_available"]);
    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date("2026-08-12T12:20:00.000Z"),
        alreadyFired: new Set(),
      }).map((reminder) => reminder.kind),
    ).toEqual(["meeting.join_available"]);
    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date("2026-08-12T12:39:59.000Z"),
        alreadyFired: new Set(),
      }).map((reminder) => reminder.kind),
    ).toEqual(["meeting.join_available"]);
    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date(session.endAt),
        alreadyFired: new Set(),
      }),
    ).toEqual([]);
  });

  it("does not fire meeting.starting once the join window opens", () => {
    const session = {
      id: "standup",
      title: "Standup",
      startAt: "2026-08-12T12:10:00.000Z",
      endAt: "2026-08-12T12:40:00.000Z",
      meetUrl,
      attendees: [],
      status: "upcoming" as const,
      source: "calendar" as const,
    };

    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date(Date.parse(session.startAt) - MEETING_JOIN_AVAILABLE_WINDOW_MS),
        alreadyFired: new Set(),
      }).map((reminder) => reminder.kind),
    ).toEqual(["meeting.join_available"]);
  });

  it("does not fire meeting.join_available without a Meet URL", () => {
    const session = {
      id: "standup",
      title: "Standup",
      startAt: "2026-08-12T12:10:00.000Z",
      endAt: "2026-08-12T12:40:00.000Z",
      meetUrl: null,
      attendees: [],
      status: "upcoming" as const,
      source: "calendar" as const,
    };

    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date("2026-08-12T12:09:00.000Z"),
        alreadyFired: new Set(),
      }).map((reminder) => reminder.kind),
    ).toEqual([]);
  });

  it("does not re-fire an already surfaced reminder", () => {
    const session = {
      id: "standup",
      title: "Standup",
      startAt: "2026-08-12T12:10:00.000Z",
      endAt: "2026-08-12T12:40:00.000Z",
      meetUrl,
      attendees: [],
      status: "upcoming" as const,
      source: "calendar" as const,
    };

    expect(
      computeMeetingReminders({
        sessions: [session],
        now: new Date("2026-08-12T12:00:00.000Z"),
        alreadyFired: new Set([
          meetingReminderFiredKey({ sessionId: "standup", kind: "meeting.starting" }),
        ]),
      }),
    ).toEqual([]);
  });
});

describe("meetingRowOffersJoin", () => {
  it("offers Join on a live Meet row even when no reminder has been seen", () => {
    const snapshot = {
      ...createIdleMeetingsWorkspace(),
      connection: "signed-in" as const,
      sessions: [
        {
          id: "live",
          title: "Interview",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://meet.google.com/abc-defg-hij",
          attendees: [],
          status: "live" as const,
          source: "calendar" as const,
        },
      ],
    };

    expect(meetingRowOffersJoin(snapshot.sessions[0]!, snapshot, NOW)).toBe(true);
  });

  it("does not offer Join on an already joined or ended row", () => {
    const live = {
      id: "live",
      title: "Interview",
      startAt: "2026-08-12T11:30:00.000Z",
      endAt: "2026-08-12T12:30:00.000Z",
      meetUrl: "https://meet.google.com/abc-defg-hij",
      attendees: [],
      status: "live" as const,
      source: "calendar" as const,
    };
    const ended = {
      ...live,
      id: "ended",
      startAt: "2026-08-12T09:00:00.000Z",
      endAt: "2026-08-12T09:30:00.000Z",
      status: "ended" as const,
    };

    expect(
      meetingRowOffersJoin(
        live,
        { ...createIdleMeetingsWorkspace(), joinedSessionId: "live" },
        NOW,
      ),
    ).toBe(false);
    expect(meetingRowOffersJoin(ended, createIdleMeetingsWorkspace(), NOW)).toBe(false);
  });
});

describe("meetings reminders workspace", () => {
  it("exposes meeting.starting and meeting.join_available on the workspace clock", async () => {
    let now = new Date("2026-08-12T12:00:00.000Z");
    const calendar = fakeCalendar({
      connected: true,
      events: [
        event({
          id: "standup",
          title: "Standup",
          startAt: "2026-08-12T12:10:00.000Z",
          endAt: "2026-08-12T12:40:00.000Z",
          meetUrl: "https://meet.google.com/abc-defg-hij",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({ clock: () => now, calendar });
    await workspace.hydrate();

    expect(workspace.getSnapshot().dueReminders.map((reminder) => reminder.kind)).toEqual([
      "meeting.starting",
    ]);

    now = new Date("2026-08-12T12:08:00.000Z");
    workspace.tick();
    expect(workspace.getSnapshot().dueReminders.map((reminder) => reminder.kind)).toEqual([
      "meeting.join_available",
    ]);
  });

  it("joinFromReminder selects the meeting and joins without switching surfaces", async () => {
    const embed = fakeEmbed();
    const calendar = fakeCalendar({
      connected: true,
      events: [
        event({
          id: "standup",
          title: "Standup",
          startAt: "2026-08-12T12:10:00.000Z",
          endAt: "2026-08-12T12:40:00.000Z",
          meetUrl: "https://meet.google.com/abc-defg-hij",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar, embed });
    await workspace.hydrate();
    const reminder = workspace.getSnapshot().dueReminders[0];
    expect(reminder).toMatchObject({ kind: "meeting.starting", sessionId: "standup" });

    await workspace.joinFromReminder(reminder!);

    expect(workspace.getSnapshot().selectedSessionId).toBe("standup");
    expect(workspace.getSnapshot().joinedSessionId).toBe("standup");
    expect(embed.calls).toEqual(["getState", "join:https://meet.google.com/abc-defg-hij"]);
    expect(workspace.getSnapshot()).not.toHaveProperty("surface");
    expect(
      meetingRowOffersJoin(workspace.getSnapshot().sessions[0]!, workspace.getSnapshot(), NOW),
    ).toBe(false);
  });

  it("keeps Join on a live row after acknowledging a missed reminder", async () => {
    const calendar = fakeCalendar({
      connected: true,
      events: [
        event({
          id: "live",
          title: "Interview",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://meet.google.com/abc-defg-hij",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, calendar });
    await workspace.hydrate();
    const reminder = workspace.getSnapshot().dueReminders[0];
    expect(reminder?.kind).toBe("meeting.join_available");

    workspace.acknowledgeReminder(reminder!);

    expect(workspace.getSnapshot().dueReminders).toEqual([]);
    expect(
      meetingRowOffersJoin(workspace.getSnapshot().sessions[0]!, workspace.getSnapshot(), NOW),
    ).toBe(true);
  });
});
