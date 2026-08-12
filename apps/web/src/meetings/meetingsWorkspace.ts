export type MeetingSessionStatus = "live" | "upcoming" | "ended";
export type MeetingsConnectionStatus = "signed-out" | "signed-in";

export type MeetingSession = {
  readonly id: string;
  readonly title: string;
  readonly startAt: string | null;
  readonly endAt: string | null;
  readonly meetUrl: string | null;
  readonly attendees: readonly string[];
  readonly status: MeetingSessionStatus;
};

export type MeetingsWorkspaceSnapshot = {
  readonly connection: MeetingsConnectionStatus;
  readonly accountEmail: string | null;
  readonly selectedSessionId: string | null;
  readonly sessions: readonly MeetingSession[];
  readonly pastedMeetUrl: string;
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
};

export function createIdleMeetingsWorkspace(): MeetingsWorkspaceSnapshot {
  return {
    connection: "signed-out",
    accountEmail: null,
    selectedSessionId: null,
    sessions: [],
    pastedMeetUrl: "",
  };
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

function toMeetingSession(event: MeetingsCalendarEvent, now: Date): MeetingSession {
  return {
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    meetUrl: event.meetUrl,
    attendees: event.attendees,
    status: meetingSessionStatus(event, now),
  };
}

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
  } = {},
): MeetingsWorkspace {
  const clock = input.clock ?? (() => new Date());
  const calendar = input.calendar ?? unsignedCalendar;
  let snapshot = createIdleMeetingsWorkspace();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setSnapshot = (next: MeetingsWorkspaceSnapshot) => {
    snapshot = next;
    emit();
  };

  const applyCalendar = (
    status: MeetingsCalendarStatus,
    events: readonly MeetingsCalendarEvent[],
  ) => {
    const now = clock();
    const sessions = events
      .map((event) => toMeetingSession(event, now))
      .toSorted(compareSessionsByStart);
    const selectedStillPresent =
      snapshot.selectedSessionId !== null &&
      sessions.some((session) => session.id === snapshot.selectedSessionId);
    setSnapshot({
      ...snapshot,
      connection: status.connected ? "signed-in" : "signed-out",
      accountEmail: status.accountEmail,
      sessions,
      selectedSessionId: selectedStillPresent ? snapshot.selectedSessionId : null,
    });
  };

  const hydrateFromStatus = async (status: MeetingsCalendarStatus) => {
    const events = status.connected ? await calendar.listToday() : [];
    applyCalendar(status, events);
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
    },
    connect: async () => {
      await hydrateFromStatus(await calendar.connect());
    },
    refresh: async () => {
      await hydrateFromStatus(await calendar.getStatus());
    },
  };
}
