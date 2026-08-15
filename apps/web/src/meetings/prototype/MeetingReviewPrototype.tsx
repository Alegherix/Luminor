import { type FormEvent, useMemo, useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { SearchInput } from "~/components/ui/search-input";
import { SidebarGroup } from "~/components/ui/sidebar";
import {
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  MonitorPlayIcon,
  NewThreadIcon,
  UsersIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { MeetingNotesEditor } from "../MeetingNotesEditor";
import { MeetingsReviewTabs, type MeetingsReviewTab } from "../MeetingsReviewTabs";
import { type MeetingsNotesStatus } from "../meetingsNotes";
import { attendeeInitials } from "../meetingsSchedule";
import { useMeetingNotes } from "../useMeetingNotes";
import { useMeetingReviewPrototypeStore } from "./prototypeStore";
import {
  actionPointClipboardText,
  actionPointThreadPrompt,
  filterPreviousMeetings,
  meetingHasReview,
  PROTOTYPE_MEETINGS,
  type PrototypeActionPoint,
  type PrototypeMeeting,
} from "./scenarios";



type RowFeedback = {
  readonly key: string;
  readonly kind: "copied" | "thread";
};



const COLLAPSED_ACTION_POINT_COUNT = 6;
const FEEDBACK_DURATION_MS = 1_600;

const CARD_CLASS_NAME =
  "rounded-xl border border-[color:var(--color-border)] bg-[var(--color-background-elevated-primary-opaque)]";

const MEETING_PANEL_SHELL_CLASS =
  "flex flex-col items-center gap-6 rounded-2xl border px-6 py-8 text-center";
const IDLE_PANEL_CLASS = "border-border bg-card";
const FEATURED_PANEL_CLASS =
  "border-success/35 bg-[radial-gradient(ellipse_80%_65%_at_50%_-10%,color-mix(in_srgb,var(--success)_22%,transparent),transparent_58%),var(--background)]";

const VISIBLE_ATTENDEES = 5;

const ATTENDEE_TONES = [
  "border-info/35 text-info/80",
  "border-success/35 text-success/80",
  "border-warning/35 text-warning/80",
  "border-foreground/20 text-muted-foreground",
] as const;

function attendeeToneClassName(label: string): string {
  let hash = 0;
  for (const character of label) {
    hash = (hash + character.charCodeAt(0)) % ATTENDEE_TONES.length;
  }
  return ATTENDEE_TONES[hash] ?? ATTENDEE_TONES[0];
}

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

function AttendeeRing({
  attendee,
  compact = false,
}: {
  readonly attendee: string;
  readonly compact?: boolean;
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
  showCount = true,
}: {
  readonly attendees: readonly string[];
  readonly compact?: boolean;
  readonly showCount?: boolean;
}) {
  if (attendees.length === 0) {
    return null;
  }
  const visible = attendees.slice(0, VISIBLE_ATTENDEES);
  const hidden = attendees.slice(VISIBLE_ATTENDEES);
  return (
    <div className="flex items-center text-muted-foreground">
      {showCount ? (
        <span className="mr-2 flex items-center gap-1">
          <UsersIcon className="size-3.5" />
          <span className="text-[length:var(--app-font-size-ui-sm,11px)] tabular-nums">
            {attendees.length}
          </span>
        </span>
      ) : null}
      {visible.map((attendee, index) => (
        <span key={attendee} className={cn("relative", index > 0 && "-ml-1.5")}>
          <AttendeeRing attendee={attendee} compact={compact} />
        </span>
      ))}
      {hidden.length > 0 ? (
        <span
          title={hidden.join(", ")}
          className={cn(
            "relative -ml-1.5 flex shrink-0 items-center justify-center rounded-full border border-border/80 bg-background px-1 font-medium text-muted-foreground",
            compact ? "size-6 text-[10px]" : "size-7 text-[11px]",
          )}
        >
          +{hidden.length}
        </span>
      ) : null}
    </div>
  );
}

function copyToClipboard(text: string): void {
  void navigator.clipboard?.writeText(text);
}

function MeetingListRow({
  meeting,
  selected,
  onSelect,
}: {
  readonly meeting: PrototypeMeeting;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const actionPointCount = meeting.overview?.actionPoints.length ?? 0;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors",
        selected
          ? "border-[color:var(--color-border)] bg-[var(--color-background-elevated-primary-opaque)]"
          : "border-transparent hover:bg-muted/50",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[length:var(--app-font-size-ui,12px)] font-medium text-foreground">
          {meeting.title}
        </span>
        <span className="truncate text-[length:var(--app-font-size-ui-sm,11px)] text-muted-foreground">
          {meeting.when} {meeting.timeRange} · {meeting.attendees.length} deltagare
        </span>
      </span>
      {meeting.live ? (
        <Badge variant="success" size="sm">
          LIVE
        </Badge>
      ) : null}
      {actionPointCount > 0 ? (
        <Badge variant="outline" size="sm">
          {actionPointCount}
        </Badge>
      ) : null}
      {meeting.processed ? (
        <CheckCircle2Icon className="size-3.5 shrink-0 text-success" aria-label="Behandlad" />
      ) : null}
    </button>
  );
}

function MeetingListSection({
  label,
  meetings,
  selectedId,
  onSelect,
}: {
  readonly label: string;
  readonly meetings: readonly PrototypeMeeting[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  if (meetings.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1" aria-label={label}>
      <p className="px-2 text-[length:var(--app-font-size-ui-sm,11px)] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <MeetingListRow
              meeting={meeting}
              selected={meeting.id === selectedId}
              onSelect={() => onSelect(meeting.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MeetingReviewPrototypeSidebar() {
  const selectedId = useMeetingReviewPrototypeStore((state) => state.selectedId);
  const search = useMeetingReviewPrototypeStore((state) => state.search);
  const selectMeeting = useMeetingReviewPrototypeStore((state) => state.selectMeeting);
  const setSearch = useMeetingReviewPrototypeStore((state) => state.setSearch);

  const liveMeetings = PROTOTYPE_MEETINGS.filter((meeting) => meeting.section === "live");
  const todayMeetings = PROTOTYPE_MEETINGS.filter((meeting) => meeting.section === "today");
  const previousMeetings = filterPreviousMeetings(PROTOTYPE_MEETINGS, search);

  const toggleMeeting = (id: string) => {
    selectMeeting(id === selectedId ? null : id);
  };

  return (
    <SidebarGroup className="flex flex-col gap-3 px-1.5 py-1.5">
      <MeetingListSection
        label="Live"
        meetings={liveMeetings}
        selectedId={selectedId}
        onSelect={toggleMeeting}
      />
      <MeetingListSection
        label="Idag"
        meetings={todayMeetings}
        selectedId={selectedId}
        onSelect={toggleMeeting}
      />
      <section className="flex flex-col gap-1.5" aria-label="Tidigare">
        <p className="px-2 text-[length:var(--app-font-size-ui-sm,11px)] font-medium uppercase tracking-wide text-muted-foreground/70">
          Tidigare
        </p>
        <div className="px-0.5">
          <SearchInput
            placeholder="Sök möten..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {previousMeetings.length === 0 ? (
          <p className="px-2 py-1 text-[length:var(--app-font-size-ui,12px)] text-muted-foreground">
            Inga möten matchar sökningen.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {previousMeetings.map((meeting) => (
              <li key={meeting.id}>
                <MeetingListRow
                  meeting={meeting}
                  selected={meeting.id === selectedId}
                  onSelect={() => toggleMeeting(meeting.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </SidebarGroup>
  );
}

function JoinMockNotice({ visible }: { readonly visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <p className="text-[length:var(--app-font-size-ui,12px)] text-muted-foreground" role="status">
      Join är mockad i prototypen.
    </p>
  );
}

function JoinByLinkForm({ onJoin }: { readonly onJoin: () => void }) {
  const [pastedMeetUrl, setPastedMeetUrl] = useState("");

  const submitPastedUrl = (event: FormEvent) => {
    event.preventDefault();
    if (pastedMeetUrl.trim().length === 0) {
      return;
    }
    onJoin();
  };

  return (
    <form
      className="flex w-full flex-col gap-2 text-left"
      aria-label="Join Google Meet by link"
      onSubmit={submitPastedUrl}
    >
      <Label htmlFor="prototype-pasted-meet-url">Google Meet link</Label>
      <div className="flex items-center gap-2">
        <Input
          id="prototype-pasted-meet-url"
          type="url"
          inputMode="url"
          placeholder="https://meet.google.com/abc-defg-hij"
          value={pastedMeetUrl}
          onChange={(event) => setPastedMeetUrl(event.currentTarget.value)}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={pastedMeetUrl.trim().length === 0}>
          Join
        </Button>
      </div>
    </form>
  );
}

function MeetingsJoinIdlePanel({ liveMeeting }: { readonly liveMeeting: PrototypeMeeting | null }) {
  const [joinAttempted, setJoinAttempted] = useState(false);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      {liveMeeting ? (
        <section
          className={cn(MEETING_PANEL_SHELL_CLASS, FEATURED_PANEL_CLASS)}
          aria-label={liveMeeting.title}
        >
          <p className="rounded-full bg-success/12 px-2.5 py-1 text-[length:var(--app-font-size-ui-xs,10px)] font-medium tracking-[0.14em] uppercase text-success">
            Live now
          </p>
          <div className="flex flex-col items-center gap-2">
            <h1 className="font-heading max-w-full text-3xl font-semibold tracking-tight text-balance text-foreground">
              {liveMeeting.title}
            </h1>
            <p className="text-lg tabular-nums text-success">{liveMeeting.timeRange}</p>
          </div>
          <AttendeeStack attendees={liveMeeting.attendees} />
          <Button type="button" size="lg" onClick={() => setJoinAttempted(true)}>
            <MonitorPlayIcon />
            Join now
          </Button>
        </section>
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

      <div className="flex flex-col gap-2">
        <JoinByLinkForm onJoin={() => setJoinAttempted(true)} />
        <JoinMockNotice visible={joinAttempted} />
      </div>
    </div>
  );
}

function MeetingHeaderMeta({ meeting }: { readonly meeting: PrototypeMeeting }) {
  return (
    <div className="flex items-center gap-4 text-[length:var(--app-font-size-ui,12px)] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <ClockIcon className="size-3.5" />
        {meeting.when} {meeting.timeRange}
      </span>
      <AttendeeStack attendees={meeting.attendees} compact />

      {meeting.processed ? (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckCircle2Icon className="size-3.5" />
          Behandlad
        </span>
      ) : meeting.live ? (
        <Badge variant="success" size="sm">
          LIVE
        </Badge>
      ) : null}
    </div>
  );
}

function UpcomingMeetingPanel({ meeting }: { readonly meeting: PrototypeMeeting }) {
  const [joinAttempted, setJoinAttempted] = useState(false);
  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <section
        className={cn(
          MEETING_PANEL_SHELL_CLASS,
          meeting.live ? FEATURED_PANEL_CLASS : IDLE_PANEL_CLASS,
        )}
        aria-label={meeting.title}
      >
        {meeting.countdownLabel ? (
          <p
            className={cn(
              "rounded-full px-2.5 py-1 text-[length:var(--app-font-size-ui-xs,10px)] font-medium tracking-[0.14em] uppercase",
              meeting.countdownLabel === "Ended"
                ? "bg-secondary text-muted-foreground"
                : "bg-success/12 text-success",
            )}
          >
            {meeting.countdownLabel}
          </p>
        ) : null}
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-heading max-w-full text-3xl font-semibold tracking-tight text-balance text-foreground">
            {meeting.title}
          </h1>
          <p
            className={cn(
              "text-lg tabular-nums",
              meeting.live ? "text-success" : "text-muted-foreground",
            )}
          >
            {meeting.timeRange}
          </p>
        </div>
        <AttendeeStack attendees={meeting.attendees} />
        <Button
          type="button"
          size="lg"
          disabled={!meeting.live}
          onClick={() => setJoinAttempted(true)}
        >
          <MonitorPlayIcon />
          Join now
        </Button>
        <JoinMockNotice visible={joinAttempted} />
      </section>
      <JoinByLinkForm onJoin={() => setJoinAttempted(true)} />
    </div>
  );
}

function ActionPointRow({
  point,
  checked,
  feedback,
  onToggle,
  onCopy,
  onStartThread,
  onJumpToMention,
}: {
  readonly point: PrototypeActionPoint;
  readonly checked: boolean;
  readonly feedback: RowFeedback | null;
  readonly onToggle: (checked: boolean) => void;
  readonly onCopy: () => void;
  readonly onStartThread: () => void;
  readonly onJumpToMention: () => void;
}) {
  const copied = feedback?.key === point.id && feedback.kind === "copied";
  const threadStarted = feedback?.key === point.id && feedback.kind === "thread";
  return (
    <tr className="border-t border-[color:var(--color-border)]/60">
      <td className="py-2.5 pl-4 pr-2 align-top">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onToggle(value === true)}
          aria-label={`Markera ${point.text}`}
        />
      </td>
      <td className="py-2.5 pr-3 align-top text-sm text-foreground">{point.text}</td>
      <td className="whitespace-nowrap py-2.5 pr-3 align-top text-sm text-muted-foreground">
        {point.owner}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 align-top text-sm text-muted-foreground">
        {point.dueDate}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-3 align-top">
        <button
          type="button"
          className="text-sm tabular-nums text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={onJumpToMention}
          title="Visa i transkriptionen"
        >
          {point.mentionedAt}
        </button>
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4 align-top">
        <span className="flex justify-end gap-1.5">
          <Button type="button" variant="outline" size="xs" onClick={onCopy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Kopierad" : "Kopiera"}
          </Button>
          <Button type="button" variant="outline" size="xs" onClick={onStartThread}>
            {threadStarted ? <CheckIcon /> : <NewThreadIcon />}
            {threadStarted ? "Startad" : "Starta tråd"}
          </Button>
        </span>
      </td>
    </tr>
  );
}

function MeetingOverviewTab({
  meeting,
  onJumpToMention,
}: {
  readonly meeting: PrototypeMeeting;
  readonly onJumpToMention: (time: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [feedback, setFeedback] = useState<RowFeedback | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overview = meeting.overview;
  const actionPoints = overview?.actionPoints ?? [];
  const visiblePoints = showAll
    ? actionPoints
    : actionPoints.slice(0, COLLAPSED_ACTION_POINT_COUNT);
  const hiddenCount = actionPoints.length - visiblePoints.length;
  const selectedPoints = actionPoints.filter((point) => selectedIds.has(point.id));
  const allSelected = actionPoints.length > 0 && selectedPoints.length === actionPoints.length;

  const flashFeedback = (next: RowFeedback) => {
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current);
    }
    setFeedback(next);
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_DURATION_MS);
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(actionPoints.map((point) => point.id)));
  };

  const copyPoints = (points: readonly PrototypeActionPoint[], feedbackKey: string) => {
    copyToClipboard(actionPointClipboardText(points));
    flashFeedback({ key: feedbackKey, kind: "copied" });
  };

  const startThread = (points: readonly PrototypeActionPoint[], feedbackKey: string) => {
    void actionPointThreadPrompt(meeting, points);
    flashFeedback({ key: feedbackKey, kind: "thread" });
  };

  if (!overview) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Mötet är inte behandlat än — ingen sammanfattning finns.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        className={cn(CARD_CLASS_NAME, "flex flex-col gap-2 p-5")}
        aria-label="Sammanfattning"
      >
        <h2 className="text-sm font-semibold text-foreground">Sammanfattning</h2>
        <div className="flex flex-col gap-1">
          {overview.summary.map((line) => (
            <p key={line} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </section>

      <section className={cn(CARD_CLASS_NAME, "flex flex-col gap-2 p-5")} aria-label="Beslut">
        <h2 className="text-sm font-semibold text-foreground">Beslut</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {overview.decisions.map((decision) => (
            <li key={decision} className="text-sm leading-6 text-muted-foreground">
              {decision}
            </li>
          ))}
        </ul>
      </section>

      <section className={cn(CARD_CLASS_NAME, "flex flex-col")} aria-label="Åtgärdspunkter">
        <div className="flex items-center gap-2 p-5 pb-3">
          <h2 className="text-sm font-semibold text-foreground">Åtgärdspunkter</h2>
          <Badge variant="outline" size="sm">
            {actionPoints.length}
          </Badge>
          <span className="ml-auto text-[length:var(--app-font-size-ui,12px)] text-muted-foreground">
            {selectedPoints.length} markerade
          </span>
          <Button type="button" variant="ghost" size="xs" onClick={toggleAll}>
            {allSelected ? "Avmarkera alla" : "Markera alla"}
          </Button>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[length:var(--app-font-size-ui,12px)] text-muted-foreground">
              <th className="w-10 pb-2 pl-4 pr-2 font-medium" aria-label="Markera" />
              <th className="pb-2 pr-3 font-medium">Åtgärdspunkt</th>
              <th className="pb-2 pr-3 font-medium">Ansvarig</th>
              <th className="pb-2 pr-3 font-medium">Förfallodatum</th>
              <th className="pb-2 pr-3 font-medium">Nämndes</th>
              <th className="pb-2 pr-4 text-right font-medium">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {visiblePoints.map((point) => (
              <ActionPointRow
                key={point.id}
                point={point}
                checked={selectedIds.has(point.id)}
                feedback={feedback}
                onToggle={(checked) => {
                  setSelectedIds((previous) => {
                    const next = new Set(previous);
                    if (checked) {
                      next.add(point.id);
                    } else {
                      next.delete(point.id);
                    }
                    return next;
                  });
                }}
                onCopy={() => copyPoints([point], point.id)}
                onStartThread={() => startThread([point], point.id)}
                onJumpToMention={() => onJumpToMention(point.mentionedAt)}
              />
            ))}
          </tbody>
        </table>
        {hiddenCount > 0 ? (
          <div className="flex justify-center border-t border-[color:var(--color-border)]/60 p-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              Visa fler åtgärdspunkter ({hiddenCount})
            </Button>
          </div>
        ) : null}
      </section>

      {selectedPoints.length > 0 ? (
        <div
          className={cn(
            CARD_CLASS_NAME,
            "sticky bottom-4 flex items-center gap-2 px-4 py-3 shadow-lg",
          )}
        >
          <span className="text-sm text-foreground">
            {selectedPoints.length} åtgärdspunkter markerade
          </span>
          <span className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyPoints(selectedPoints, "bulk")}
            >
              {feedback?.key === "bulk" && feedback.kind === "copied" ? (
                <CheckIcon />
              ) : (
                <CopyIcon />
              )}
              {feedback?.key === "bulk" && feedback.kind === "copied"
                ? "Kopierade"
                : "Kopiera markerade"}
            </Button>
            <Button type="button" size="sm" onClick={() => startThread(selectedPoints, "bulk")}>
              {feedback?.key === "bulk" && feedback.kind === "thread" ? (
                <CheckIcon />
              ) : (
                <NewThreadIcon />
              )}
              {feedback?.key === "bulk" && feedback.kind === "thread"
                ? "Tråd startad"
                : "Starta tråd från markerade"}
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function MeetingTranscriptTab({
  meeting,
  highlightedTime,
}: {
  readonly meeting: PrototypeMeeting;
  readonly highlightedTime: string | null;
}) {
  if (meeting.transcript.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Ingen transkription finns för det här mötet.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {meeting.transcript.map((segment) => (
        <li
          key={`${segment.time}-${segment.speaker}`}
          className={cn(
            "flex gap-3 rounded-lg px-3 py-2",
            segment.time === highlightedTime && "bg-muted",
          )}
        >
          <span className="w-14 shrink-0 pt-0.5 text-[length:var(--app-font-size-ui,12px)] tabular-nums text-muted-foreground">
            {segment.time}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[length:var(--app-font-size-ui,12px)] font-medium text-foreground">
              {segment.speaker}
            </span>
            <span className="text-sm leading-6 text-muted-foreground">{segment.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function prototypeNotesSessionId(meetingId: string): string {
  return `prototype:${meetingId}`;
}

export function resolvePrototypeNotesDraft({
  status,
  notes,
  scenarioNotes,
  edited,
}: {
  readonly status: MeetingsNotesStatus;
  readonly notes: string;
  readonly scenarioNotes: string | null;
  readonly edited: boolean;
}): string {
  const useScenarioNotes = !edited && status === "idle" && notes.length === 0;
  return useScenarioNotes ? (scenarioNotes ?? "") : notes;
}

export function MeetingNotesTab({ meeting }: { readonly meeting: PrototypeMeeting }) {
  const { notes, setNotes, status } = useMeetingNotes(prototypeNotesSessionId(meeting.id));
  const [edited, setEdited] = useState(false);
  const draft = resolvePrototypeNotesDraft({
    status,
    notes,
    scenarioNotes: meeting.notes,
    edited,
  });

  return (
    <section className="flex flex-col gap-3" aria-label="Anteckningar">
      <MeetingNotesEditor
        notes={draft}
        status={status}
        onNotesChange={(next) => {
          setEdited(true);
          setNotes(next);
        }}
        placeholder="Inga anteckningar än — skriv här så sparas de till mötet."
      />
    </section>
  );
}

function MeetingReviewDetail({ meeting }: { readonly meeting: PrototypeMeeting }) {
  const [tab, setTab] = useState<MeetingsReviewTab>("overview");
  const [highlightedTime, setHighlightedTime] = useState<string | null>(null);

  const jumpToMention = (time: string) => {
    setHighlightedTime(time);
    setTab("transcript");
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {meeting.title}
        </h1>
        <MeetingHeaderMeta meeting={meeting} />
      </header>

      <MeetingsReviewTabs tab={tab} onTabChange={setTab} />

      {tab === "overview" ? (
        <MeetingOverviewTab meeting={meeting} onJumpToMention={jumpToMention} />
      ) : tab === "transcript" ? (
        <MeetingTranscriptTab meeting={meeting} highlightedTime={highlightedTime} />
      ) : (
        <MeetingNotesTab meeting={meeting} />
      )}
    </div>
  );
}

export function MeetingReviewPrototype() {
  const selectedId = useMeetingReviewPrototypeStore((state) => state.selectedId);

  const liveMeeting = useMemo(
    () => PROTOTYPE_MEETINGS.find((meeting) => meeting.live === true) ?? null,
    [],
  );
  const selectedMeeting = PROTOTYPE_MEETINGS.find((meeting) => meeting.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto px-8 py-8">
      {selectedMeeting === null ? (
        <MeetingsJoinIdlePanel liveMeeting={liveMeeting} />
      ) : meetingHasReview(selectedMeeting) ? (
        <MeetingReviewDetail key={selectedMeeting.id} meeting={selectedMeeting} />
      ) : (
        <UpcomingMeetingPanel key={selectedMeeting.id} meeting={selectedMeeting} />
      )}
    </div>
  );
}
