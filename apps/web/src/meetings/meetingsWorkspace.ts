import {
  INVALID_MEET_URL_MESSAGE,
  MISSING_MEET_URL_MESSAGE,
  isGoogleMeetJoinUrl,
  normalizePastedMeetUrl,
  pastedMeetingSessionId,
  pastedMeetingTitle,
} from "./meetUrl";

export type MeetingSessionStatus = "live" | "upcoming" | "ended";
export type MeetingsConnectionStatus = "signed-out" | "signed-in";
export type MeetingSessionSource = "calendar" | "pasted";

export type MeetingSession = {
  readonly id: string;
  readonly title: string;
  readonly startAt: string | null;
  readonly endAt: string | null;
  readonly meetUrl: string | null;
  readonly attendees: readonly string[];
  readonly status: MeetingSessionStatus;
  readonly source: MeetingSessionSource;
};

export type MeetingReminderKind = "meeting.starting" | "meeting.join_available";

export type MeetingReminder = {
  readonly kind: MeetingReminderKind;
  readonly sessionId: string;
  readonly title: string;
  readonly meetUrl: string | null;
};

export type MeetingsRecordingMode = "system+mic" | "mic";
export type MeetingsRecordingStatus = "idle" | "recording";

export type MeetingsRecordingState = {
  readonly status: MeetingsRecordingStatus;
  readonly mode: MeetingsRecordingMode | null;
  readonly sessionId: string | null;
  readonly filePath: string | null;
  readonly degradation: string | null;
};

export const IDLE_MEETINGS_RECORDING: MeetingsRecordingState = {
  status: "idle",
  mode: null,
  sessionId: null,
  filePath: null,
  degradation: null,
};

export const MEETINGS_LOOPBACK_DEGRADATION =
  "System audio is unavailable. Recording microphone only.";

export type MeetingsRecordingHost = {
  start(sessionId: string): Promise<MeetingsRecordingState>;
  stop(): Promise<MeetingsRecordingState>;
  getState(): Promise<MeetingsRecordingState>;
};

export type MeetingsWorkspaceSnapshot = {
  readonly connection: MeetingsConnectionStatus;
  readonly accountEmail: string | null;
  readonly selectedSessionId: string | null;
  readonly joinedSessionId: string | null;
  readonly embedVisible: boolean;
  readonly joinError: string | null;
  readonly recording: MeetingsRecordingState;
  readonly sessions: readonly MeetingSession[];
  readonly pastedMeetUrl: string;
  readonly dueReminders: readonly MeetingReminder[];
};

export type MeetingsEmbedState = {
  readonly joined: boolean;
  readonly visible: boolean;
  readonly url: string | null;
};

export type MeetingsEmbedHost = {
  join(url: string): Promise<MeetingsEmbedState>;
  hide(): Promise<MeetingsEmbedState>;
  show(): Promise<MeetingsEmbedState>;
  leave(): Promise<MeetingsEmbedState>;
  getState(): Promise<MeetingsEmbedState>;
};

export type MeetingsSidebarSections = {
  readonly live: readonly MeetingSession[];
  readonly today: readonly MeetingSession[];
  readonly ended: readonly MeetingSession[];
};

export type MeetingsCalendarEvent = {
  readonly id: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly meetUrl: string | null;
  readonly attendees: readonly string[];
};

export type MeetingsCalendarStatus = {
  readonly connected: boolean;
  readonly accountEmail: string | null;
};

export type MeetingsCalendarHost = {
  getStatus(): Promise<MeetingsCalendarStatus>;
  connect(): Promise<MeetingsCalendarStatus>;
  listToday(): Promise<readonly MeetingsCalendarEvent[]>;
};

export type MeetingsWorkspace = {
  getSnapshot(): MeetingsWorkspaceSnapshot;
  subscribe(listener: () => void): () => void;
  selectSession(sessionId: string | null): void;
  hydrate(): Promise<void>;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  tick(): void;
  acknowledgeReminder(reminder: MeetingReminder): void;
  joinFromReminder(reminder: MeetingReminder): Promise<void>;
  joinPastedUrl(url: string): Promise<void>;
  joinSession(sessionId: string): Promise<void>;
  leave(): Promise<void>;
  hideEmbed(): Promise<void>;
  showEmbed(): Promise<void>;
};

export function createIdleMeetingsWorkspace(): MeetingsWorkspaceSnapshot {
  return {
    connection: "signed-out",
    accountEmail: null,
    selectedSessionId: null,
    joinedSessionId: null,
    embedVisible: false,
    joinError: null,
    recording: IDLE_MEETINGS_RECORDING,
    sessions: [],
    pastedMeetUrl: "",
    dueReminders: [],
  };
}

export const MEETING_STARTING_WINDOW_MS = 10 * 60_000;
export const MEETING_JOIN_AVAILABLE_WINDOW_MS = 2 * 60_000;
export const MEETING_REMINDER_TICK_MS = 30_000;

export function meetingReminderFiredKey(input: {
  readonly sessionId: string;
  readonly kind: MeetingReminderKind;
}): string {
  return `${input.sessionId}|${input.kind}`;
}

export function meetingsSurfaceJoined(snapshot: MeetingsWorkspaceSnapshot): boolean {
  return snapshot.joinedSessionId !== null;
}

export const IDLE_MEETINGS_WORKSPACE = createIdleMeetingsWorkspace();

export function selectedMeetingSession(snapshot: MeetingsWorkspaceSnapshot): MeetingSession | null {
  if (snapshot.selectedSessionId === null) {
    return null;
  }
  return snapshot.sessions.find((session) => session.id === snapshot.selectedSessionId) ?? null;
}

export function meetingSessionStatus(
  session: Pick<MeetingSession, "startAt" | "endAt">,
  now: Date,
): MeetingSessionStatus {
  const startAt = session.startAt === null ? Number.NaN : Date.parse(session.startAt);
  const endAt = session.endAt === null ? Number.NaN : Date.parse(session.endAt);
  const nowMs = now.getTime();
  if (Number.isFinite(endAt) && endAt <= nowMs) {
    return "ended";
  }
  if (Number.isFinite(startAt) && startAt <= nowMs) {
    return "live";
  }
  return "upcoming";
}

function sessionStartMs(session: Pick<MeetingSession, "startAt">): number {
  if (session.startAt === null) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(session.startAt);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareSessionsByStart(left: MeetingSession, right: MeetingSession): number {
  return sessionStartMs(left) - sessionStartMs(right);
}

export function meetingsSidebarSections(
  snapshot: MeetingsWorkspaceSnapshot,
  now: Date = new Date(),
): MeetingsSidebarSections {
  const live: MeetingSession[] = [];
  const upcoming: MeetingSession[] = [];
  const ended: MeetingSession[] = [];

  for (const session of snapshot.sessions) {
    const status = meetingSessionStatus(session, now);
    if (status === "ended") {
      ended.push(session);
    } else if (status === "live") {
      live.push(session);
    } else {
      upcoming.push(session);
    }
  }

  live.sort(compareSessionsByStart);
  upcoming.sort(compareSessionsByStart);
  ended.sort(compareSessionsByStart);

  if (live.length > 0) {
    return { live, today: upcoming, ended };
  }

  const [next, ...remaining] = upcoming;
  return {
    live: next === undefined ? [] : [next],
    today: remaining,
    ended,
  };
}

function isInsideMeetingReminderWindow(input: {
  readonly session: Pick<MeetingSession, "startAt" | "endAt" | "status">;
  readonly nowMs: number;
  readonly windowMs: number;
  readonly expiresBeforeStartMs?: number;
}): boolean {
  const startMs = input.session.startAt === null ? Number.NaN : Date.parse(input.session.startAt);
  const endMs =
    input.session.endAt === null ? Number.POSITIVE_INFINITY : Date.parse(input.session.endAt);
  if (!Number.isFinite(startMs) || (input.session.endAt !== null && !Number.isFinite(endMs))) {
    return false;
  }
  if (input.session.status === "ended" || input.nowMs >= endMs) {
    return false;
  }
  if (input.nowMs < startMs - input.windowMs) {
    return false;
  }
  return (
    input.expiresBeforeStartMs === undefined || input.nowMs < startMs - input.expiresBeforeStartMs
  );
}

export function computeMeetingReminders(input: {
  readonly sessions: readonly MeetingSession[];
  readonly now: Date;
  readonly alreadyFired: ReadonlySet<string>;
  readonly joinedSessionId?: string | null;
}): MeetingReminder[] {
  const nowMs = input.now.getTime();
  const reminders: MeetingReminder[] = [];

  for (const session of input.sessions) {
    if (input.joinedSessionId !== null && session.id === input.joinedSessionId) {
      continue;
    }
    const current = withSessionStatus(session, input.now);

    if (
      isInsideMeetingReminderWindow({
        session: current,
        nowMs,
        windowMs: MEETING_STARTING_WINDOW_MS,
        expiresBeforeStartMs: MEETING_JOIN_AVAILABLE_WINDOW_MS,
      })
    ) {
      const starting: MeetingReminder = {
        kind: "meeting.starting",
        sessionId: session.id,
        title: session.title,
        meetUrl: session.meetUrl,
      };
      if (!input.alreadyFired.has(meetingReminderFiredKey(starting))) {
        reminders.push(starting);
      }
    }

    if (
      session.meetUrl &&
      isGoogleMeetJoinUrl(session.meetUrl) &&
      isInsideMeetingReminderWindow({
        session: current,
        nowMs,
        windowMs: MEETING_JOIN_AVAILABLE_WINDOW_MS,
      })
    ) {
      const joinAvailable: MeetingReminder = {
        kind: "meeting.join_available",
        sessionId: session.id,
        title: session.title,
        meetUrl: session.meetUrl,
      };
      if (!input.alreadyFired.has(meetingReminderFiredKey(joinAvailable))) {
        reminders.push(joinAvailable);
      }
    }
  }

  return reminders;
}

export function meetingRowOffersJoin(
  session: MeetingSession,
  snapshot: MeetingsWorkspaceSnapshot,
  now: Date = new Date(),
): boolean {
  if (snapshot.joinedSessionId === session.id) {
    return false;
  }
  if (!session.meetUrl || !isGoogleMeetJoinUrl(session.meetUrl)) {
    return false;
  }
  if (meetingSessionStatus(session, now) === "ended") {
    return false;
  }
  return meetingsSidebarSections(snapshot, now).live.some((item) => item.id === session.id);
}

function toMeetingSession(event: MeetingsCalendarEvent, now: Date): MeetingSession {
  return {
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    meetUrl: event.meetUrl,
    attendees: event.attendees,
    status: meetingSessionStatus(event, now),
    source: "calendar",
  };
}

function withSessionStatus(session: MeetingSession, now: Date): MeetingSession {
  return {
    ...session,
    status: meetingSessionStatus(session, now),
  };
}

const idleEmbed: MeetingsEmbedHost = {
  async join() {
    return { joined: false, visible: false, url: null };
  },
  async hide() {
    return { joined: false, visible: false, url: null };
  },
  async show() {
    return { joined: false, visible: false, url: null };
  },
  async leave() {
    return { joined: false, visible: false, url: null };
  },
  async getState() {
    return { joined: false, visible: false, url: null };
  },
};

const idleRecording: MeetingsRecordingHost = {
  async start() {
    return IDLE_MEETINGS_RECORDING;
  },
  async stop() {
    return IDLE_MEETINGS_RECORDING;
  },
  async getState() {
    return IDLE_MEETINGS_RECORDING;
  },
};

const unsignedCalendar: MeetingsCalendarHost = {
  async getStatus() {
    return { connected: false, accountEmail: null };
  },
  async connect() {
    return { connected: false, accountEmail: null };
  },
  async listToday() {
    return [];
  },
};

export function createMeetingsWorkspace(
  input: {
    readonly clock?: () => Date;
    readonly calendar?: MeetingsCalendarHost;
    readonly embed?: MeetingsEmbedHost;
    readonly recording?: MeetingsRecordingHost;
  } = {},
): MeetingsWorkspace {
  const clock = input.clock ?? (() => new Date());
  const calendar = input.calendar ?? unsignedCalendar;
  const embed = input.embed ?? idleEmbed;
  const recording = input.recording ?? idleRecording;
  let snapshot = createIdleMeetingsWorkspace();
  const listeners = new Set<() => void>();
  const alreadyFired = new Set<string>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const withDueReminders = (next: MeetingsWorkspaceSnapshot): MeetingsWorkspaceSnapshot => {
    const now = clock();
    const sessions = next.sessions.map((session) => withSessionStatus(session, now));
    return {
      ...next,
      sessions,
      dueReminders: computeMeetingReminders({
        sessions,
        now,
        alreadyFired,
        joinedSessionId: next.joinedSessionId,
      }),
    };
  };

  const setSnapshot = (next: MeetingsWorkspaceSnapshot) => {
    snapshot = withDueReminders(next);
    emit();
  };

  const mergeCalendarSessions = (
    events: readonly MeetingsCalendarEvent[],
    now: Date,
  ): MeetingSession[] => {
    const calendarSessions = events.map((event) => toMeetingSession(event, now));
    const calendarIds = new Set(calendarSessions.map((session) => session.id));
    const calendarMeetUrls = new Set(
      calendarSessions
        .map((session) => session.meetUrl)
        .filter((value): value is string => value !== null),
    );
    const preserved = snapshot.sessions.filter((session) => {
      if (session.source === "pasted") {
        return session.meetUrl === null || !calendarMeetUrls.has(session.meetUrl);
      }
      return session.id === snapshot.joinedSessionId && !calendarIds.has(session.id);
    });
    return [
      ...calendarSessions,
      ...preserved.map((session) => withSessionStatus(session, now)),
    ].toSorted(compareSessionsByStart);
  };

  const retargetJoinedSessionId = (
    sessions: readonly MeetingSession[],
    joinedSessionId: string | null,
  ): string | null => {
    if (joinedSessionId === null) {
      return null;
    }
    if (sessions.some((session) => session.id === joinedSessionId)) {
      return joinedSessionId;
    }
    const previous = snapshot.sessions.find((session) => session.id === joinedSessionId);
    if (!previous?.meetUrl) {
      return joinedSessionId;
    }
    return sessions.find((session) => session.meetUrl === previous.meetUrl)?.id ?? joinedSessionId;
  };

  const applyCalendar = (
    status: MeetingsCalendarStatus,
    events: readonly MeetingsCalendarEvent[],
  ) => {
    const now = clock();
    const sessions = mergeCalendarSessions(events, now);
    const joinedSessionId = retargetJoinedSessionId(sessions, snapshot.joinedSessionId);
    const selectedStillPresent =
      snapshot.selectedSessionId !== null &&
      sessions.some((session) => session.id === snapshot.selectedSessionId);
    setSnapshot({
      ...snapshot,
      connection: status.connected ? "signed-in" : "signed-out",
      accountEmail: status.accountEmail,
      sessions,
      selectedSessionId: selectedStillPresent ? snapshot.selectedSessionId : joinedSessionId,
      joinedSessionId,
    });
  };

  const hydrateFromStatus = async (status: MeetingsCalendarStatus) => {
    const events = status.connected ? await calendar.listToday() : [];
    applyCalendar(status, events);
  };

  const markPastedSessionEnded = (
    sessions: readonly MeetingSession[],
    sessionId: string | null,
    now: Date,
  ): MeetingSession[] => {
    if (sessionId === null) {
      return [...sessions];
    }
    return sessions.map((session) => {
      if (session.id !== sessionId || session.source !== "pasted") {
        return session;
      }
      const ended = { ...session, endAt: now.toISOString() };
      return withSessionStatus(ended, now);
    });
  };

  const applyEmbedState = (state: MeetingsEmbedState) => {
    setSnapshot({
      ...snapshot,
      embedVisible: state.joined && state.visible,
      joinedSessionId: state.joined ? snapshot.joinedSessionId : null,
    });
  };

  const restoreJoinedFromEmbed = (state: MeetingsEmbedState) => {
    if (!state.joined || !state.url || !isGoogleMeetJoinUrl(state.url)) {
      if (snapshot.joinedSessionId !== null && !state.joined) {
        setSnapshot({
          ...snapshot,
          joinedSessionId: null,
          embedVisible: false,
        });
      }
      return;
    }
    const now = clock();
    const existing =
      snapshot.sessions.find((session) => session.meetUrl === state.url) ??
      snapshot.sessions.find((session) => session.id === snapshot.joinedSessionId);
    const session =
      existing ??
      ({
        id: pastedMeetingSessionId(state.url) ?? `pasted:${state.url}`,
        title: pastedMeetingTitle(state.url),
        startAt: now.toISOString(),
        endAt: null,
        meetUrl: state.url,
        attendees: [],
        status: "live",
        source: "pasted",
      } satisfies MeetingSession);
    const sessions = existing
      ? snapshot.sessions.map((item) =>
          item.id === existing.id ? withSessionStatus(item, now) : item,
        )
      : [...snapshot.sessions, session];
    setSnapshot({
      ...snapshot,
      sessions,
      selectedSessionId: session.id,
      joinedSessionId: session.id,
      embedVisible: state.visible,
      joinError: null,
    });
  };

  const startRecordingForSession = async (sessionId: string): Promise<MeetingsRecordingState> => {
    if (snapshot.recording.status === "recording" && snapshot.recording.sessionId === sessionId) {
      return snapshot.recording;
    }
    try {
      return await recording.start(sessionId);
    } catch (error) {
      return {
        ...IDLE_MEETINGS_RECORDING,
        sessionId,
        degradation: error instanceof Error ? error.message : "Recording could not start.",
      };
    }
  };

  const joinMeetUrl = async (input: {
    readonly session: MeetingSession;
    readonly meetUrl: string;
    readonly pastedMeetUrl?: string;
  }) => {
    if (snapshot.joinedSessionId === input.session.id && snapshot.embedVisible) {
      const shown = await embed.show();
      applyEmbedState(shown);
      setSnapshot({
        ...snapshot,
        selectedSessionId: input.session.id,
        joinError: null,
        pastedMeetUrl: input.pastedMeetUrl ?? snapshot.pastedMeetUrl,
      });
      return;
    }

    const now = clock();
    let sessions = snapshot.sessions.some((session) => session.id === input.session.id)
      ? snapshot.sessions.map((session) =>
          session.id === input.session.id ? withSessionStatus(input.session, now) : session,
        )
      : [...snapshot.sessions, withSessionStatus(input.session, now)];
    if (snapshot.joinedSessionId !== null && snapshot.joinedSessionId !== input.session.id) {
      sessions = markPastedSessionEnded(sessions, snapshot.joinedSessionId, now);
      await recording.stop();
      await embed.leave();
    }
    const joined = await embed.join(input.meetUrl);
    const recordingState = await startRecordingForSession(input.session.id);
    setSnapshot({
      ...snapshot,
      sessions,
      selectedSessionId: input.session.id,
      joinedSessionId: input.session.id,
      embedVisible: joined.visible,
      joinError: null,
      recording: recordingState,
      pastedMeetUrl: input.pastedMeetUrl ?? snapshot.pastedMeetUrl,
    });
  };

  const joinSession = async (sessionId: string) => {
    const session = snapshot.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    if (!session.meetUrl || !isGoogleMeetJoinUrl(session.meetUrl)) {
      setSnapshot({
        ...snapshot,
        selectedSessionId: sessionId,
        joinError: MISSING_MEET_URL_MESSAGE,
      });
      return;
    }
    await joinMeetUrl({ session, meetUrl: session.meetUrl });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    selectSession: (sessionId) => {
      if (sessionId !== null && !snapshot.sessions.some((session) => session.id === sessionId)) {
        return;
      }
      setSnapshot({ ...snapshot, selectedSessionId: sessionId });
    },
    hydrate: async () => {
      await hydrateFromStatus(await calendar.getStatus());
      restoreJoinedFromEmbed(await embed.getState());
      if (snapshot.joinedSessionId !== null) {
        setSnapshot({
          ...snapshot,
          recording: await startRecordingForSession(snapshot.joinedSessionId),
        });
        return;
      }
      setSnapshot({
        ...snapshot,
        recording: await recording.getState(),
      });
    },
    connect: async () => {
      await hydrateFromStatus(await calendar.connect());
    },
    refresh: async () => {
      await hydrateFromStatus(await calendar.getStatus());
    },
    tick: () => {
      setSnapshot(snapshot);
    },
    acknowledgeReminder: (reminder) => {
      alreadyFired.add(meetingReminderFiredKey(reminder));
      setSnapshot(snapshot);
    },
    joinFromReminder: async (reminder) => {
      alreadyFired.add(meetingReminderFiredKey(reminder));
      const session = snapshot.sessions.find((item) => item.id === reminder.sessionId);
      if (!session) {
        setSnapshot(snapshot);
        return;
      }
      setSnapshot({ ...snapshot, selectedSessionId: session.id, joinError: null });
      if (!session.meetUrl || !isGoogleMeetJoinUrl(session.meetUrl)) {
        return;
      }
      await joinSession(session.id);
    },
    joinPastedUrl: async (url) => {
      const meetUrl = normalizePastedMeetUrl(url);
      if (!meetUrl) {
        setSnapshot({
          ...snapshot,
          pastedMeetUrl: url,
          joinError: INVALID_MEET_URL_MESSAGE,
        });
        return;
      }
      const now = clock();
      const sessionId = pastedMeetingSessionId(meetUrl) ?? `pasted:${meetUrl}`;
      const existing =
        snapshot.sessions.find((session) => session.id === sessionId) ??
        snapshot.sessions.find((session) => session.meetUrl === meetUrl);
      const session: MeetingSession = existing
        ? {
            ...existing,
            meetUrl,
            endAt: existing.source === "pasted" ? null : existing.endAt,
          }
        : {
            id: sessionId,
            title: pastedMeetingTitle(meetUrl),
            startAt: now.toISOString(),
            endAt: null,
            meetUrl,
            attendees: [],
            status: "live",
            source: "pasted",
          };
      await joinMeetUrl({ session, meetUrl, pastedMeetUrl: url });
    },
    joinSession,
    leave: async () => {
      if (snapshot.joinedSessionId === null) {
        return;
      }
      const now = clock();
      const sessions = markPastedSessionEnded(snapshot.sessions, snapshot.joinedSessionId, now);
      await recording.stop();
      await embed.leave();
      setSnapshot({
        ...snapshot,
        sessions,
        joinedSessionId: null,
        embedVisible: false,
        joinError: null,
        recording: IDLE_MEETINGS_RECORDING,
      });
    },
    hideEmbed: async () => {
      if (snapshot.joinedSessionId === null) {
        return;
      }
      const hidden = await embed.hide();
      setSnapshot({
        ...snapshot,
        embedVisible: hidden.visible,
      });
    },
    showEmbed: async () => {
      if (snapshot.joinedSessionId === null) {
        return;
      }
      const shown = await embed.show();
      setSnapshot({
        ...snapshot,
        embedVisible: shown.visible,
      });
    },
  };
}
