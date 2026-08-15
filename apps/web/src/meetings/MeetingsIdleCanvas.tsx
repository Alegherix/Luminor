import { type FormEvent, useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toastManager } from "~/components/ui/toast";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { CopyIcon, MonitorPlayIcon, UsersIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import {
  attendeeInitials,
  displayMeetUrl,
  featuredMeetingSession,
  formatMeetingClock,
  formatMeetingTimeRange,
  meetingCountdown,
  meetingIsOnLocalDay,
  todaysScheduleSessions,
} from "./meetingsSchedule";
import {
  meetingRowOffersJoin,
  meetingSessionStatus,
  meetingsSidebarSections,
  type MeetingSession,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";

const COUNTDOWN_TICK_MS = 15_000;
const VISIBLE_ATTENDEES = 3;

const ATTENDEE_TONES = [
  "border-info/35 text-info/80",
  "border-success/35 text-success/80",
  "border-warning/35 text-warning/80",
  "border-foreground/20 text-muted-foreground",
] as const;

const MEETING_PANEL_SHELL_CLASS =
  "flex flex-col items-center gap-6 rounded-2xl border px-6 py-8 text-center";
const IDLE_PANEL_CLASS = "border-border bg-card";
const FEATURED_PANEL_CLASS =
  "border-success/35 bg-[radial-gradient(ellipse_80%_65%_at_50%_-10%,color-mix(in_srgb,var(--success)_22%,transparent),transparent_58%),var(--background)]";
const FEATURED_ROW_CLASS =
  "border-success/30 bg-[radial-gradient(ellipse_70%_120%_at_0%_50%,color-mix(in_srgb,var(--success)_16%,transparent),var(--background)_72%)]";

function MeetPlaceholderIcon() {
  return (
    <span
      className="flex size-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width="28" height="28" focusable="false">
        <rect x="3" y="6" width="13" height="12" rx="2.5" fill="currentColor" opacity="0.9" />
        <path d="M16 10.5l4-2.2v7.4l-4-2.2z" fill="currentColor" opacity="0.9" />
      </svg>
    </span>
  );
}

function attendeeToneClassName(label: string): string {
  let hash = 0;
  for (const character of label) {
    hash = (hash + character.charCodeAt(0)) % ATTENDEE_TONES.length;
  }
  return ATTENDEE_TONES[hash] ?? ATTENDEE_TONES[0];
}

function AttendeeRing({
  attendee,
  compact,
}: {
  readonly attendee: string;
  readonly compact: boolean;
}) {
  return (
    <span
      title={attendee}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border bg-background font-medium",
        compact ? "size-6 text-[10px]" : "size-7 text-[11px]",
        attendeeToneClassName(attendee),
      )}
    >
      {attendeeInitials(attendee)}
    </span>
  );
}

function AttendeeStack({
  attendees,
  compact = false,
}: {
  readonly attendees: readonly string[];
  readonly compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (attendees.length === 0) {
    return null;
  }
  const visible = attendees.slice(0, VISIBLE_ATTENDEES);
  const hidden = attendees.slice(VISIBLE_ATTENDEES);
  const overflow = hidden.length;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-muted-foreground",
        compact ? "items-end" : "items-center",
      )}
    >
      <div className="flex items-center">
        {compact ? null : (
          <span className="mr-2 flex items-center gap-1">
            <UsersIcon className="size-3.5" />
            <span className="text-[length:var(--app-font-size-ui-sm,11px)] tabular-nums">
              {attendees.length}
            </span>
          </span>
        )}
        {visible.map((attendee, index) => (
          <span key={`${attendee}-${index}`} className={cn("relative", index > 0 && "-ml-1.5")}>
            <AttendeeRing attendee={attendee} compact={compact} />
          </span>
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? "Hide extra attendees"
                : overflow === 1
                  ? "Show 1 more attendee"
                  : `Show ${overflow} more attendees`
            }
            className={cn(
              "relative -ml-1.5 flex shrink-0 items-center justify-center rounded-full border border-border/80 bg-background font-medium text-muted-foreground",
              compact ? "size-6 px-1 text-[10px]" : "size-7 px-1.5 text-[11px]",
            )}
            onClick={() => setExpanded((open) => !open)}
          >
            +{overflow}
          </button>
        ) : null}
      </div>
      {overflow > 0 ? (
        <DisclosureRegion open={expanded}>
          <ul className={cn("flex flex-col gap-1.5", compact ? "items-end" : "items-center")}>
            {hidden.map((attendee, index) => (
              <li
                key={`${attendee}-hidden-${index}`}
                className="flex items-center gap-1.5 text-[length:var(--app-font-size-ui-sm,11px)] text-foreground"
              >
                <AttendeeRing attendee={attendee} compact={compact} />
                <span className="max-w-48 truncate">{attendee}</span>
              </li>
            ))}
          </ul>
        </DisclosureRegion>
      ) : null}
    </div>
  );
}

function JoinByLinkForm({
  workspace,
  joining,
  onJoinPastedUrl,
}: {
  readonly workspace?: MeetingsWorkspaceSnapshot | undefined;
  readonly joining: boolean;
  readonly onJoinPastedUrl?: ((url: string) => void) | undefined;
}) {
  const [pastedMeetUrl, setPastedMeetUrl] = useState(workspace?.pastedMeetUrl ?? "");
  const joinError = workspace?.joinError ?? null;

  const submitPastedUrl = (event: FormEvent) => {
    event.preventDefault();
    const url = pastedMeetUrl.trim();
    if (url.length === 0 || joining) {
      return;
    }
    onJoinPastedUrl?.(url);
  };

  return (
    <form
      className="flex w-full flex-col gap-2 text-left"
      aria-label="Join Google Meet by link"
      onSubmit={submitPastedUrl}
    >
      <Label htmlFor="meetings-pasted-meet-url">Google Meet link</Label>
      <div className="flex items-center gap-2">
        <Input
          id="meetings-pasted-meet-url"
          type="url"
          inputMode="url"
          placeholder="https://meet.google.com/abc-defg-hij"
          value={pastedMeetUrl}
          onChange={(event) => setPastedMeetUrl(event.currentTarget.value)}
          className="min-w-0 flex-1"
          aria-invalid={joinError !== null}
        />
        <Button type="submit" disabled={joining || pastedMeetUrl.trim().length === 0}>
          Join
        </Button>
      </div>
      {joinError ? (
        <p className="text-sm text-destructive" role="alert">
          {joinError}
        </p>
      ) : null}
    </form>
  );
}

function FeaturedMeetingPanel({
  session,
  workspace,
  now,
  joining,
  onJoinSession,
  onCopyMeetUrl,
}: {
  readonly session: MeetingSession;
  readonly workspace: MeetingsWorkspaceSnapshot;
  readonly now: Date;
  readonly joining: boolean;
  readonly onJoinSession?: ((sessionId: string) => void) | undefined;
  readonly onCopyMeetUrl: (url: string) => void;
}) {
  const countdown = meetingCountdown(session, now);
  const timeRange = formatMeetingTimeRange(session);
  const offersJoin = meetingRowOffersJoin(session, workspace, now);
  const status = meetingSessionStatus(session, now);

  return (
    <section
      className={cn(
        MEETING_PANEL_SHELL_CLASS,
        status === "ended" ? IDLE_PANEL_CLASS : FEATURED_PANEL_CLASS,
      )}
      aria-label={session.title}
    >
      {countdown ? (
        <p
          className={cn(
            "rounded-full px-2.5 py-1 text-[length:var(--app-font-size-ui-xs,10px)] font-medium tracking-[0.14em] uppercase",
            countdown.kind === "ended"
              ? "bg-secondary text-muted-foreground"
              : "bg-success/12 text-success",
          )}
        >
          {countdown.badge}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-2">
        <h1 className="font-heading max-w-full text-3xl font-semibold tracking-tight text-balance text-foreground">
          {session.title}
        </h1>
        {timeRange ? (
          <p
            className={cn(
              "text-lg tabular-nums",
              status === "ended" ? "text-muted-foreground" : "text-success",
            )}
          >
            {timeRange}
          </p>
        ) : null}
      </div>

      <AttendeeStack attendees={session.attendees} />

      <div className="flex items-center justify-center gap-2">
        <Button
          type="button"
          size="lg"
          disabled={joining || !offersJoin}
          onClick={() => onJoinSession?.(session.id)}
        >
          <MonitorPlayIcon />
          Join now
        </Button>
        {session.meetUrl ? (
          <IconButton
            label="Copy meeting link"
            variant="outline"
            size="icon-lg"
            onClick={() => {
              if (session.meetUrl) {
                onCopyMeetUrl(session.meetUrl);
              }
            }}
          >
            <CopyIcon />
          </IconButton>
        ) : null}
      </div>

      {session.meetUrl ? (
        <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-border/80 bg-background/50 px-3 py-2.5 text-left">
          <div className="min-w-0">
            <p className="text-[length:var(--app-font-size-ui-sm,11px)] text-muted-foreground">
              Google Meet link
            </p>
            <p className="truncate text-sm text-foreground">{displayMeetUrl(session.meetUrl)}</p>
          </div>
          <IconButton
            label="Copy Google Meet link"
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              if (session.meetUrl) {
                onCopyMeetUrl(session.meetUrl);
              }
            }}
          >
            <CopyIcon />
          </IconButton>
        </div>
      ) : null}
    </section>
  );
}

function ScheduleRow({
  session,
  workspace,
  now,
  selected,
  featured,
  onSelectSession,
  onJoinSession,
}: {
  readonly session: MeetingSession;
  readonly workspace: MeetingsWorkspaceSnapshot;
  readonly now: Date;
  readonly selected: boolean;
  readonly featured: boolean;
  readonly onSelectSession?: ((sessionId: string | null) => void) | undefined;
  readonly onJoinSession?: ((sessionId: string) => void) | undefined;
}) {
  const clock = formatMeetingClock(session.startAt);
  const timeRange = formatMeetingTimeRange(session);
  const countdown = meetingCountdown(session, now);
  const offersJoin = meetingRowOffersJoin(session, workspace, now);
  const status = meetingSessionStatus(session, now);

  return (
    <li className="grid grid-cols-[1rem_3.25rem_minmax(0,1fr)] items-stretch gap-x-3">
      <div className="relative flex justify-center">
        <span className="absolute inset-y-0 w-px bg-border" aria-hidden />
        <span
          className={cn(
            "relative z-10 mt-3.5 flex size-3.5 items-center justify-center rounded-full border bg-background",
            featured || status === "live" ? "border-success" : "border-muted-foreground/40",
          )}
          aria-hidden
        >
          {featured || status === "live" ? (
            <span className="size-1.5 rounded-full bg-success" />
          ) : null}
        </span>
      </div>
      <div className="flex flex-col items-start pt-3">
        <span className="text-sm font-medium tabular-nums text-foreground">{clock ?? "—"}</span>
        {countdown && countdown.kind !== "ended" ? (
          <span
            className={cn(
              "text-[length:var(--app-font-size-ui-xs,10px)]",
              countdown.kind === "live" || featured ? "text-success" : "text-muted-foreground",
            )}
          >
            {countdown.compact}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "mb-2 flex items-center gap-3 rounded-xl border px-3 py-2.5",
          featured
            ? FEATURED_ROW_CLASS
            : selected
              ? "border-border bg-secondary/50"
              : "border-border/80 bg-card",
        )}
      >
        <button
          type="button"
          aria-pressed={selected}
          className="min-w-0 flex-1 text-left"
          onClick={() => onSelectSession?.(selected ? null : session.id)}
        >
          <p className="truncate font-medium text-foreground">{session.title}</p>
          {timeRange ? (
            <p className="mt-0.5 text-[length:var(--app-font-size-ui-sm,11px)] tabular-nums text-muted-foreground">
              {timeRange}
            </p>
          ) : null}
        </button>
        <AttendeeStack attendees={session.attendees} compact />
        {offersJoin ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onJoinSession?.(session.id)}
          >
            Join
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function MeetingsIdleCanvas({
  workspace,
  now: nowProp,
  onJoinPastedUrl,
  onJoinSession,
  onSelectSession,
  joining = false,
}: {
  readonly workspace?: MeetingsWorkspaceSnapshot;
  readonly now?: Date;
  readonly onJoinPastedUrl?: (url: string) => void;
  readonly onJoinSession?: (sessionId: string) => void;
  readonly onSelectSession?: (sessionId: string | null) => void;
  readonly joining?: boolean;
}) {
  const [clockNow, setClockNow] = useState(() => nowProp ?? new Date());
  const [endedOpen, setEndedOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const now = nowProp ?? clockNow;

  useEffect(() => {
    if (nowProp) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setClockNow(new Date());
    }, COUNTDOWN_TICK_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [nowProp]);

  const { copyToClipboard } = useCopyToClipboard({
    onCopy: () => toastManager.add({ type: "success", title: "Meeting link copied" }),
    onError: (error) =>
      toastManager.add({
        type: "error",
        title: "Could not copy meeting link",
        description: error instanceof Error ? error.message : "An error occurred.",
      }),
  });

  const featured = workspace ? featuredMeetingSession(workspace, now) : null;
  const remaining = workspace ? todaysScheduleSessions(workspace, now) : [];
  const ended = workspace
    ? meetingsSidebarSections(workspace, now).ended.filter((session) =>
        meetingIsOnLocalDay(session.startAt, now),
      )
    : [];
  const linkExpanded = linkOpen || Boolean(workspace?.joinError);

  return (
    <section
      className="flex h-full min-h-0 justify-center overflow-y-auto px-6 py-8"
      aria-label="Meeting cockpit"
    >
      <div className="flex w-full max-w-2xl flex-col gap-8">
        {featured && workspace ? (
          <FeaturedMeetingPanel
            session={featured}
            workspace={workspace}
            now={now}
            joining={joining}
            onJoinSession={onJoinSession}
            onCopyMeetUrl={(url) => copyToClipboard(url, undefined)}
          />
        ) : (
          <section
            className={cn(MEETING_PANEL_SHELL_CLASS, IDLE_PANEL_CLASS)}
            aria-label="No meeting to join yet"
          >
            <MeetPlaceholderIcon />
            <div className="flex flex-col gap-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                No meeting to join yet
              </h1>
              <p className="text-sm text-muted-foreground">
                Today’s remaining meetings will land here, with a join panel when one is about to
                start.
              </p>
            </div>
          </section>
        )}

        {workspace && remaining.length > 0 ? (
          <section className="flex flex-col gap-3" aria-label="Today's schedule">
            <h2 className="text-[length:var(--app-font-size-ui,12px)] font-medium text-muted-foreground">
              Today’s schedule
            </h2>
            <ol className="flex flex-col">
              {remaining.map((session) => (
                <ScheduleRow
                  key={session.id}
                  session={session}
                  workspace={workspace}
                  now={now}
                  selected={session.id === workspace.selectedSessionId}
                  featured={session.id === featured?.id}
                  onSelectSession={onSelectSession}
                  onJoinSession={onJoinSession}
                />
              ))}
            </ol>
            {ended.length > 0 ? (
              <div className="flex flex-col">
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border/80 px-3 py-2 text-[length:var(--app-font-size-ui,12px)] text-muted-foreground"
                  aria-expanded={endedOpen}
                  onClick={() => setEndedOpen((open) => !open)}
                >
                  View full schedule
                  <DisclosureChevron open={endedOpen} />
                </button>
                <DisclosureRegion open={endedOpen}>
                  <ol className="mt-2 flex flex-col">
                    {ended.map((session) => (
                      <ScheduleRow
                        key={session.id}
                        session={session}
                        workspace={workspace}
                        now={now}
                        selected={session.id === workspace.selectedSessionId}
                        featured={false}
                        onSelectSession={onSelectSession}
                        onJoinSession={onJoinSession}
                      />
                    ))}
                  </ol>
                </DisclosureRegion>
              </div>
            ) : null}
          </section>
        ) : workspace && ended.length > 0 ? (
          <p className="text-center text-sm text-muted-foreground">No more meetings today</p>
        ) : null}

        {featured ? (
          <div className="flex flex-col">
            <button
              type="button"
              className="flex items-center gap-1.5 text-left text-[length:var(--app-font-size-ui,12px)] text-muted-foreground"
              aria-expanded={linkExpanded}
              onClick={() => setLinkOpen((open) => !open)}
            >
              Join with a link
              <DisclosureChevron open={linkExpanded} />
            </button>
            <DisclosureRegion open={linkExpanded}>
              <div className="pt-3">
                <JoinByLinkForm
                  workspace={workspace}
                  joining={joining}
                  onJoinPastedUrl={onJoinPastedUrl}
                />
              </div>
            </DisclosureRegion>
          </div>
        ) : (
          <JoinByLinkForm
            workspace={workspace}
            joining={joining}
            onJoinPastedUrl={onJoinPastedUrl}
          />
        )}
      </div>
    </section>
  );
}
