import { describe, expect, it, vi } from "vitest";

import {
  computeMeetingReminders,
  createIdleMeetingsWorkspace,
  createMeetingsWorkspace,
  meetingReminderFiredKey,
  meetingRowOffersJoin,
  MEETING_JOIN_AVAILABLE_WINDOW_MS,
  MEETING_STARTING_WINDOW_MS,
  IDLE_MEETINGS_RECORDING,
  IDLE_MEETINGS_SUMMARY,
  IDLE_MEETINGS_TRANSCRIPTION,
  MEETINGS_LOOPBACK_DEGRADATION,
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
  meetingsSidebarSections,
  meetingsSurfaceJoined,
  selectedMeetingSession,
  type MeetingsCalendarEvent,
  type MeetingsCalendarHost,
  type MeetingsEmbedHost,
  type MeetingsEmbedState,
  type MeetingsExternalHost,
  type MeetingsRecordingHost,
  type MeetingsRecordingState,
  type MeetingsSummaryHost,
  type MeetingsSummaryState,
  type MeetingsTranscriptionHost,
  type MeetingsTranscriptionState,
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
    expect(workspace.recording).toEqual(IDLE_MEETINGS_RECORDING);
    expect(workspace.summary).toEqual(IDLE_MEETINGS_SUMMARY);
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

function fakeExternal(): MeetingsExternalHost & {
  calls: string[];
  openTabs: string[];
} {
  const host = {
    calls: [] as string[],
    openTabs: [] as string[],
    async open(url: string) {
      host.calls.push(`open:${url}`);
      host.openTabs.push(url);
      return true;
    },
  };
  return host;
}

describe("meetings join and leave", () => {
  it("rejects an invalid pasted URL without joining", async () => {
    const embed = fakeEmbed();
    const external = fakeExternal();
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed, external });

    await workspace.joinPastedUrl("not a url");

    expect(workspace.getSnapshot().joinError).toBe(INVALID_MEET_URL_MESSAGE);
    expect(workspace.getSnapshot().sessions).toEqual([]);
    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(false);
    expect(embed.calls).toEqual([]);
    expect(external.calls).toEqual([]);
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

describe("meetings external join", () => {
  it("opens a pasted non-Meet http(s) link in the system browser and counts it as joined", async () => {
    const embed = fakeEmbed();
    const external = fakeExternal();
    const tape = fakeRecording();
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed,
      external,
      recording: tape,
    });

    await workspace.joinPastedUrl("https://zoom.us/j/123");

    const snapshot = workspace.getSnapshot();
    expect(snapshot.joinError).toBeNull();
    expect(snapshot.joinedSessionId).toBe("pasted:https://zoom.us/j/123");
    expect(snapshot.joinKind).toBe("external");
    expect(snapshot.embedVisible).toBe(false);
    expect(meetingsSurfaceJoined(snapshot)).toBe(true);
    expect(snapshot.recording).toEqual({
      status: "recording",
      mode: "system+mic",
      sessionId: "pasted:https://zoom.us/j/123",
      filePath: recordingFilePath("pasted:https://zoom.us/j/123"),
      degradation: null,
    });
    expect(embed.calls).toEqual([]);
    expect(external.calls).toEqual(["open:https://zoom.us/j/123"]);
    expect(
      snapshot.sessions.some(
        (session) =>
          session.id === "pasted:https://zoom.us/j/123" &&
          session.meetUrl === "https://zoom.us/j/123",
      ),
    ).toBe(true);
  });

  it("joins a calendar event with a non-Meet URL through the same external path", async () => {
    const embed = fakeEmbed();
    const external = fakeExternal();
    const tape = fakeRecording();
    const calendar = fakeCalendar({
      connected: true,
      events: [
        event({
          id: "zoom",
          title: "Vendor call",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://zoom.us/j/123",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      calendar,
      embed,
      external,
      recording: tape,
    });
    await workspace.hydrate();
    workspace.selectSession("zoom");

    await workspace.joinSession("zoom");

    const snapshot = workspace.getSnapshot();
    expect(snapshot.joinedSessionId).toBe("zoom");
    expect(snapshot.joinKind).toBe("external");
    expect(snapshot.embedVisible).toBe(false);
    expect(meetingsSurfaceJoined(snapshot)).toBe(true);
    expect(snapshot.recording.status).toBe("recording");
    expect(snapshot.recording.sessionId).toBe("zoom");
    expect(embed.calls.filter((call) => call.startsWith("join:"))).toEqual([]);
    expect(external.calls).toEqual(["open:https://zoom.us/j/123"]);
  });

  it("leaves an external join without closing the system-browser tab", async () => {
    const embed = fakeEmbed();
    const external = fakeExternal();
    const tape = fakeRecording();
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed,
      external,
      recording: tape,
    });
    await workspace.joinPastedUrl("https://zoom.us/j/123");

    await workspace.leave();

    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(false);
    expect(workspace.getSnapshot().joinKind).toBeNull();
    expect(workspace.getSnapshot().joinedSessionId).toBeNull();
    expect(workspace.getSnapshot().recording).toEqual(IDLE_MEETINGS_RECORDING);
    expect(tape.calls).toEqual(["start:pasted:https://zoom.us/j/123", "stop"]);
    expect(external.openTabs).toEqual(["https://zoom.us/j/123"]);
    expect(embed.calls).toEqual(["leave"]);
  });

  it("does not show or hide an embed for an external join", async () => {
    const embed = fakeEmbed();
    const external = fakeExternal();
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed, external });
    await workspace.joinPastedUrl("https://zoom.us/j/123");

    await workspace.hideEmbed();
    await workspace.showEmbed();

    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(true);
    expect(workspace.getSnapshot().embedVisible).toBe(false);
    expect(workspace.getSnapshot().joinKind).toBe("external");
    expect(embed.calls).toEqual([]);
  });

  it("keeps an external join across hydrate when the embed is idle", async () => {
    const embed = fakeEmbed();
    const external = fakeExternal();
    const tape = fakeRecording();
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed,
      external,
      recording: tape,
    });
    await workspace.joinPastedUrl("https://zoom.us/j/123");

    await workspace.hydrate();

    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(true);
    expect(workspace.getSnapshot().joinKind).toBe("external");
    expect(workspace.getSnapshot().recording.status).toBe("recording");
    expect(embed.calls.filter((call) => call.startsWith("join:"))).toEqual([]);
  });

  it("still embeds a Meet URL instead of opening the system browser", async () => {
    const embed = fakeEmbed();
    const external = fakeExternal();
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed, external });

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");

    expect(workspace.getSnapshot().joinKind).toBe("embed");
    expect(workspace.getSnapshot().embedVisible).toBe(true);
    expect(embed.calls).toEqual(["join:https://meet.google.com/abc-defg-hij"]);
    expect(external.calls).toEqual([]);
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

  it("offers Join on a live non-Meet http(s) row", () => {
    const snapshot = {
      ...createIdleMeetingsWorkspace(),
      connection: "signed-in" as const,
      sessions: [
        {
          id: "zoom",
          title: "Vendor call",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://zoom.us/j/123",
          attendees: [],
          status: "live" as const,
          source: "calendar" as const,
        },
      ],
    };

    expect(meetingRowOffersJoin(snapshot.sessions[0]!, snapshot, NOW)).toBe(true);
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

function recordingFilePath(sessionId: string): string {
  return `/tmp/luminor-home/meetings/${sessionId.replaceAll(":", "_")}/recordings/tape.webm`;
}

function fakeRecording(startState?: Partial<MeetingsRecordingState>): MeetingsRecordingHost & {
  calls: string[];
  state: MeetingsRecordingState;
} {
  const host = {
    calls: [] as string[],
    state: { ...IDLE_MEETINGS_RECORDING } as MeetingsRecordingState,
    async start(sessionId: string) {
      host.calls.push(`start:${sessionId}`);
      host.state = {
        status: "recording",
        mode: "system+mic",
        degradation: null,
        ...startState,
        sessionId,
        filePath: startState?.filePath ?? recordingFilePath(sessionId),
      };
      return host.state;
    },
    async stop() {
      host.calls.push("stop");
      host.state = { ...IDLE_MEETINGS_RECORDING };
      return host.state;
    },
    async getState() {
      host.calls.push("getState");
      return host.state;
    },
  };
  return host;
}

describe("meetings recording", () => {
  it("starts system+mic recording on embedded join without a source picker", async () => {
    const embed = fakeEmbed();
    const tape = fakeRecording();
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed, recording: tape });

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");

    const snapshot = workspace.getSnapshot();
    expect(snapshot.joinedSessionId).toBe("pasted:abc-defg-hij");
    expect(snapshot.recording).toEqual({
      status: "recording",
      mode: "system+mic",
      sessionId: "pasted:abc-defg-hij",
      filePath: recordingFilePath("pasted:abc-defg-hij"),
      degradation: null,
    });
    expect(tape.calls).toEqual(["start:pasted:abc-defg-hij"]);
    expect(tape.calls.join(" ")).not.toMatch(/picker|source/i);
  });

  it("stops recording on leave and keeps recording while the embed is hidden", async () => {
    const embed = fakeEmbed();
    const tape = fakeRecording();
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed, recording: tape });
    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");

    await workspace.hideEmbed();
    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(true);
    expect(workspace.getSnapshot().recording.status).toBe("recording");
    expect(workspace.getSnapshot().recording.filePath).toBe(
      recordingFilePath("pasted:abc-defg-hij"),
    );
    expect(tape.calls).toEqual(["start:pasted:abc-defg-hij"]);

    await workspace.showEmbed();
    expect(workspace.getSnapshot().recording.status).toBe("recording");
    expect(tape.calls).toEqual(["start:pasted:abc-defg-hij"]);

    await workspace.leave();
    expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(false);
    expect(workspace.getSnapshot().recording).toEqual(IDLE_MEETINGS_RECORDING);
    expect(tape.calls).toEqual(["start:pasted:abc-defg-hij", "stop"]);
  });

  it("continues as mic-only with a visible degradation when loopback cannot start", async () => {
    const embed = fakeEmbed();
    const tape = fakeRecording({
      mode: "mic",
      degradation: MEETINGS_LOOPBACK_DEGRADATION,
    });
    const workspace = createMeetingsWorkspace({ clock: () => NOW, embed, recording: tape });

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");

    const snapshot = workspace.getSnapshot();
    expect(snapshot.joinedSessionId).toBe("pasted:abc-defg-hij");
    expect(snapshot.recording.status).toBe("recording");
    expect(snapshot.recording.mode).toBe("mic");
    expect(snapshot.recording.degradation).toBe(MEETINGS_LOOPBACK_DEGRADATION);
    expect(snapshot.recording.filePath).toBe(recordingFilePath("pasted:abc-defg-hij"));
  });
});

function transcriptFilePath(sessionId: string): string {
  return `/tmp/luminor-home/meetings/${sessionId.replaceAll(":", "_")}/transcripts/transcript.txt`;
}

function summaryFilePath(sessionId: string): string {
  return `/tmp/luminor-home/meetings/${sessionId.replaceAll(":", "_")}/transcripts/summary.md`;
}

function fakeTranscription(
  startState?: Partial<MeetingsTranscriptionState>,
): MeetingsTranscriptionHost & {
  calls: string[];
  next: MeetingsTranscriptionState;
} {
  const host = {
    calls: [] as string[],
    next: {
      status: "ready" as const,
      sessionId: null,
      transcriptPath: null,
      text: "Hello from the meeting.",
      error: null,
      ...startState,
    } as MeetingsTranscriptionState,
    async transcribe(input: { sessionId: string; recordingPath: string }) {
      host.calls.push(`transcribe:${input.sessionId}:${input.recordingPath}`);
      return {
        ...host.next,
        sessionId: input.sessionId,
        transcriptPath: host.next.transcriptPath ?? transcriptFilePath(input.sessionId),
      };
    },
    async getTranscript(sessionId: string) {
      host.calls.push(`get:${sessionId}`);
      return {
        ...host.next,
        sessionId,
        transcriptPath: host.next.transcriptPath ?? transcriptFilePath(sessionId),
      };
    },
    async pointAtEnvironment() {
      host.calls.push("point");
      return { status: "configured" as const, error: null };
    },
  };
  return host;
}

describe("meetings post-meeting transcription", () => {
  it("starts idle with no transcript and no transcribe action on the workspace", () => {
    const workspace = createIdleMeetingsWorkspace();

    expect(workspace.transcription).toEqual(IDLE_MEETINGS_TRANSCRIPTION);
    expect(workspace).not.toHaveProperty("transcribe");
  });

  it("stops recording on leave and starts post-meeting transcription without a manual button", async () => {
    const embed = fakeEmbed();
    const tape = fakeRecording();
    const scribe = fakeTranscription();
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed,
      recording: tape,
      transcription: scribe,
    });

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");
    await workspace.leave();

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().transcription.status).toBe("ready");
    });
    expect(workspace.getSnapshot().recording).toEqual(IDLE_MEETINGS_RECORDING);
    expect(scribe.calls).toEqual([
      `transcribe:pasted:abc-defg-hij:${recordingFilePath("pasted:abc-defg-hij")}`,
    ]);
    expect(workspace.getSnapshot().transcription).toEqual({
      status: "ready",
      sessionId: "pasted:abc-defg-hij",
      transcriptPath: transcriptFilePath("pasted:abc-defg-hij"),
      text: "Hello from the meeting.",
      error: null,
    });
    expect(meetingsSidebarSections(workspace.getSnapshot(), NOW).ended[0]?.id).toBe(
      "pasted:abc-defg-hij",
    );
  });

  it("does not start transcription when the embed is only hidden", async () => {
    const embed = fakeEmbed();
    const tape = fakeRecording();
    const scribe = fakeTranscription();
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed,
      recording: tape,
      transcription: scribe,
    });
    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");

    await workspace.hideEmbed();
    await workspace.showEmbed();

    expect(scribe.calls).toEqual([]);
    expect(workspace.getSnapshot().transcription).toEqual(IDLE_MEETINGS_TRANSCRIPTION);
    expect(workspace.getSnapshot().recording.status).toBe("recording");
  });

  it("stops recording and starts transcription when a joined meeting reaches scheduled end", async () => {
    let now = new Date("2026-08-12T12:00:00.000Z");
    const embed = fakeEmbed();
    const tape = fakeRecording();
    const scribe = fakeTranscription();
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
    const workspace = createMeetingsWorkspace({
      clock: () => now,
      calendar,
      embed,
      recording: tape,
      transcription: scribe,
    });
    await workspace.hydrate();
    await workspace.joinSession("live");
    expect(workspace.getSnapshot().recording.status).toBe("recording");

    now = new Date("2026-08-12T12:30:00.000Z");
    workspace.tick();

    await vi.waitFor(() => {
      expect(meetingsSurfaceJoined(workspace.getSnapshot())).toBe(false);
      expect(workspace.getSnapshot().transcription.status).toBe("ready");
    });
    expect(tape.calls).toEqual(["getState", "start:live", "stop"]);
    expect(scribe.calls).toEqual([`transcribe:live:${recordingFilePath("live")}`]);
    expect(meetingsSidebarSections(workspace.getSnapshot(), now).ended[0]?.id).toBe("live");
  });

  it("loads the transcript when today's ended meeting is selected", async () => {
    const scribe = fakeTranscription();
    const calendar = fakeCalendar({
      connected: true,
      events: [
        event({
          id: "ended",
          title: "Standup",
          startAt: "2026-08-12T09:00:00.000Z",
          endAt: "2026-08-12T09:30:00.000Z",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      calendar,
      transcription: scribe,
    });
    await workspace.hydrate();

    workspace.selectSession("ended");

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().transcription.status).toBe("ready");
    });
    expect(selectedMeetingSession(workspace.getSnapshot())?.id).toBe("ended");
    expect(scribe.calls).toEqual(["get:ended"]);
    expect(workspace.getSnapshot().transcription.text).toBe("Hello from the meeting.");
  });

  it("surfaces a point-at-the-environment recovery when seeding cannot find the binary", async () => {
    const scribe = fakeTranscription({
      status: "needs-environment",
      text: null,
      transcriptPath: null,
      error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
    });
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed: fakeEmbed(),
      recording: fakeRecording(),
      transcription: scribe,
    });
    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");
    await workspace.leave();

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().transcription.status).toBe("needs-environment");
    });
    expect(workspace.getSnapshot().transcription.error).toBe(
      MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
    );

    scribe.next = {
      status: "ready",
      sessionId: "pasted:abc-defg-hij",
      transcriptPath: transcriptFilePath("pasted:abc-defg-hij"),
      text: "Hello from the meeting.",
      error: null,
    };
    await workspace.pointAtTranscriptionEnvironment();

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().transcription.status).toBe("ready");
    });
    expect(scribe.calls).toEqual([
      `transcribe:pasted:abc-defg-hij:${recordingFilePath("pasted:abc-defg-hij")}`,
      "point",
      `transcribe:pasted:abc-defg-hij:${recordingFilePath("pasted:abc-defg-hij")}`,
    ]);
  });
});

function fakeSummary(startState?: Partial<MeetingsSummaryState>): MeetingsSummaryHost & {
  calls: string[];
  next: MeetingsSummaryState;
} {
  const host = {
    calls: [] as string[],
    next: {
      status: "ready" as const,
      sessionId: null,
      summaryPath: null,
      text: "We shipped the join path.",
      error: null,
      ...startState,
    } as MeetingsSummaryState,
    async summarize(input: {
      sessionId: string;
      title: string;
      transcriptText: string;
      transcriptPath: string | null;
    }) {
      host.calls.push(`summarize:${input.sessionId}:${input.title}:${input.transcriptText}`);
      return {
        ...host.next,
        sessionId: input.sessionId,
        summaryPath: host.next.summaryPath ?? summaryFilePath(input.sessionId),
      };
    },
    async getSummary(sessionId: string) {
      host.calls.push(`get:${sessionId}`);
      return {
        ...host.next,
        sessionId,
        summaryPath: host.next.summaryPath ?? summaryFilePath(sessionId),
      };
    },
  };
  return host;
}

describe("meetings silent summary", () => {
  it("starts a silent summary after a ready transcript and does not create a thread", async () => {
    const scribe = fakeTranscription();
    const notes = fakeSummary();
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed: fakeEmbed(),
      recording: fakeRecording(),
      transcription: scribe,
      summary: notes,
    });

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");
    await workspace.leave();

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().summary.status).toBe("ready");
    });
    expect(notes.calls).toEqual([
      "summarize:pasted:abc-defg-hij:Meet abc-defg-hij:Hello from the meeting.",
    ]);
    expect(workspace.getSnapshot().summary).toEqual({
      status: "ready",
      sessionId: "pasted:abc-defg-hij",
      summaryPath: summaryFilePath("pasted:abc-defg-hij"),
      text: "We shipped the join path.",
      error: null,
    });
    expect(workspace).not.toHaveProperty("createThread");
    expect(workspace).not.toHaveProperty("openInChat");
    expect(meetingsSidebarSections(workspace.getSnapshot(), NOW).ended[0]?.id).toBe(
      "pasted:abc-defg-hij",
    );
  });

  it("does not start a summary when transcription fails", async () => {
    const scribe = fakeTranscription({
      status: "failed",
      text: null,
      transcriptPath: null,
      error: "Recording is missing.",
    });
    const notes = fakeSummary();
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed: fakeEmbed(),
      recording: fakeRecording(),
      transcription: scribe,
      summary: notes,
    });

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");
    await workspace.leave();

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().transcription.status).toBe("failed");
    });
    expect(notes.calls).toEqual([]);
    expect(workspace.getSnapshot().summary.status).toBe("idle");
  });

  it("keeps a successful transcript visible when the silent summary fails", async () => {
    const scribe = fakeTranscription();
    const notes = fakeSummary({
      status: "failed",
      text: null,
      summaryPath: null,
      error: "Summary failed.",
    });
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      embed: fakeEmbed(),
      recording: fakeRecording(),
      transcription: scribe,
      summary: notes,
    });

    await workspace.joinPastedUrl("https://meet.google.com/abc-defg-hij");
    await workspace.leave();

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().summary.status).toBe("failed");
    });
    expect(workspace.getSnapshot().transcription).toMatchObject({
      status: "ready",
      text: "Hello from the meeting.",
    });
    expect(workspace.getSnapshot().summary.error).toBe("Summary failed.");
  });

  it("loads transcript and summary when today's ended meeting is selected", async () => {
    const scribe = fakeTranscription();
    const notes = fakeSummary();
    const calendar = fakeCalendar({
      connected: true,
      events: [
        event({
          id: "ended",
          title: "Standup",
          startAt: "2026-08-12T09:00:00.000Z",
          endAt: "2026-08-12T09:30:00.000Z",
        }),
      ],
    });
    const workspace = createMeetingsWorkspace({
      clock: () => NOW,
      calendar,
      transcription: scribe,
      summary: notes,
    });
    await workspace.hydrate();

    workspace.selectSession("ended");

    await vi.waitFor(() => {
      expect(workspace.getSnapshot().summary.status).toBe("ready");
    });
    expect(scribe.calls).toEqual(["get:ended"]);
    expect(notes.calls).toEqual(["get:ended"]);
    expect(workspace.getSnapshot().transcription.text).toBe("Hello from the meeting.");
    expect(workspace.getSnapshot().summary.text).toBe("We shipped the join path.");
  });
});
