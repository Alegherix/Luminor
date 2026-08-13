import {
  meetingSessionStatus,
  meetingsSidebarSections,
  type MeetingSession,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";

const MEETING_CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export type MeetingCountdownKind = "starts-in" | "live" | "ended";

export type MeetingCountdown = {
  readonly kind: MeetingCountdownKind;
  readonly badge: string;
  readonly compact: string;
};

export function parseMeetingInstant(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatMeetingClock(value: string | null): string | null {
  const parsed = parseMeetingInstant(value);
  if (parsed === null) {
    return null;
  }
  return MEETING_CLOCK_FORMAT.format(new Date(parsed));
}

export function formatMeetingTimeRange(
  session: Pick<MeetingSession, "startAt" | "endAt">,
): string | null {
  const start = formatMeetingClock(session.startAt);
  if (start === null) {
    return null;
  }
  const end = formatMeetingClock(session.endAt);
  return end === null ? start : `${start} – ${end}`;
}

export function displayMeetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.host}${path}`;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

export function attendeeInitials(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return "?";
  }
  const local = trimmed.includes("@") ? (trimmed.split("@")[0] ?? trimmed) : trimmed;
  const parts = local.split(/[\s._-]+/).filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function meetingCountdown(
  session: Pick<MeetingSession, "startAt" | "endAt">,
  now: Date,
): MeetingCountdown | null {
  const status = meetingSessionStatus(session, now);
  if (status === "ended") {
    return { kind: "ended", badge: "Ended", compact: "Ended" };
  }
  if (status === "live") {
    return { kind: "live", badge: "Live now", compact: "Live" };
  }
  const startMs = parseMeetingInstant(session.startAt);
  if (startMs === null) {
    return null;
  }
  const remainingMs = startMs - now.getTime();
  if (remainingMs <= 0) {
    return { kind: "live", badge: "Live now", compact: "Live" };
  }
  if (remainingMs < MINUTE_MS) {
    return { kind: "starts-in", badge: "Starts in less than a minute", compact: "Now" };
  }
  if (remainingMs < HOUR_MS) {
    const minutes = Math.round(remainingMs / MINUTE_MS);
    return {
      kind: "starts-in",
      badge: minutes === 1 ? "Starts in 1 min" : `Starts in ${minutes} min`,
      compact: minutes === 1 ? "In 1 min" : `In ${minutes} min`,
    };
  }
  const hours = Math.floor(remainingMs / HOUR_MS);
  const minutes = Math.round((remainingMs % HOUR_MS) / MINUTE_MS);
  if (minutes === 0) {
    return {
      kind: "starts-in",
      badge: hours === 1 ? "Starts in 1 hr" : `Starts in ${hours} hr`,
      compact: hours === 1 ? "In 1 hr" : `In ${hours} hr`,
    };
  }
  return {
    kind: "starts-in",
    badge: `Starts in ${hours} hr ${minutes} min`,
    compact: `In ${hours} hr ${minutes} min`,
  };
}

export function featuredMeetingSession(
  snapshot: MeetingsWorkspaceSnapshot,
  now: Date = new Date(),
): MeetingSession | null {
  return meetingsSidebarSections(snapshot, now).live[0] ?? null;
}

export function todaysScheduleSessions(
  snapshot: MeetingsWorkspaceSnapshot,
  now: Date = new Date(),
): readonly MeetingSession[] {
  const sections = meetingsSidebarSections(snapshot, now);
  return [...sections.live, ...sections.today];
}
