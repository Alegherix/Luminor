export type MeetingSessionStatus = "live" | "upcoming" | "ended";

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
  readonly selectedSessionId: string | null;
  readonly sessions: readonly MeetingSession[];
  readonly pastedMeetUrl: string;
};

export type MeetingsSidebarSections = {
  readonly live: readonly MeetingSession[];
  readonly today: readonly MeetingSession[];
  readonly ended: readonly MeetingSession[];
};

export function createIdleMeetingsWorkspace(): MeetingsWorkspaceSnapshot {
  return {
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

export function meetingsSidebarSections(
  snapshot: MeetingsWorkspaceSnapshot,
): MeetingsSidebarSections {
  return {
    live: snapshot.sessions.filter((session) => session.status === "live"),
    today: snapshot.sessions.filter((session) => session.status === "upcoming"),
    ended: snapshot.sessions.filter((session) => session.status === "ended"),
  };
}
