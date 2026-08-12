import { Button } from "~/components/ui/button";
import { SidebarGroup } from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";
import {
  SIDEBAR_HEADER_ROW_CLASS_NAME,
  SIDEBAR_ROW_ACTIVE_CLASS_NAME,
  SIDEBAR_ROW_HOVER_CLASS_NAME,
  SIDEBAR_ROW_IDLE_TEXT_CLASS_NAME,
  SIDEBAR_SECTION_LABEL_CLASS_NAME,
} from "~/sidebarRowStyles";
import {
  meetingsSidebarSections,
  type MeetingSession,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";

const EMPTY_SECTION_COPY = {
  live: "No live meeting",
  today: "No other meetings today",
  ended: "No ended meetings today",
} as const;

const SECTION_LABELS = {
  live: "Live",
  today: "Today",
  ended: "Ended",
} as const;

const SESSION_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatSessionTime(session: MeetingSession): string | null {
  if (session.startAt === null) {
    return null;
  }
  const start = new Date(session.startAt);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  return SESSION_TIME_FORMAT.format(start);
}

function MeetingsSidebarSection({
  section,
  emptyLabel,
  sessions,
  selectedSessionId,
  onSelectSession,
}: {
  readonly section: "live" | "today" | "ended";
  readonly emptyLabel: string;
  readonly sessions: readonly MeetingSession[];
  readonly selectedSessionId: string | null;
  readonly onSelectSession?: ((sessionId: string) => void) | undefined;
}) {
  return (
    <section className="my-1" aria-label={SECTION_LABELS[section]}>
      <div className="flex h-7 w-full min-w-0 items-center px-2 py-0.5">
        <span className={SIDEBAR_SECTION_LABEL_CLASS_NAME}>{SECTION_LABELS[section]}</span>
      </div>
      {sessions.length === 0 ? (
        emptyLabel ? (
          <p className="px-2 pt-1 pb-3 text-[length:var(--app-font-size-ui,12px)] text-muted-foreground/58">
            {emptyLabel}
          </p>
        ) : null
      ) : (
        <ul className="flex flex-col gap-0.5">
          {sessions.map((session) => {
            const selected = session.id === selectedSessionId;
            const time = formatSessionTime(session);
            return (
              <li key={session.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  className={cn(
                    SIDEBAR_HEADER_ROW_CLASS_NAME,
                    selected ? SIDEBAR_ROW_ACTIVE_CLASS_NAME : SIDEBAR_ROW_HOVER_CLASS_NAME,
                    selected ? undefined : SIDEBAR_ROW_IDLE_TEXT_CLASS_NAME,
                  )}
                  onClick={() => onSelectSession?.(session.id)}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{session.title}</span>
                  {time ? (
                    <span className="shrink-0 text-[length:var(--app-font-size-ui-sm,11px)] text-muted-foreground">
                      {time}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MeetingsSidebarList({
  workspace,
  now,
  onSelectSession,
  onConnect,
  connecting = false,
  connectError = null,
}: {
  readonly workspace: MeetingsWorkspaceSnapshot;
  readonly now?: Date;
  readonly onSelectSession?: (sessionId: string) => void;
  readonly onConnect?: () => void;
  readonly connecting?: boolean;
  readonly connectError?: string | null;
}) {
  if (workspace.connection === "signed-out") {
    return (
      <SidebarGroup className="px-1.5 py-1.5">
        <section className="flex flex-col gap-3 px-2 py-2" aria-label="Connect Google Calendar">
          <div className="flex flex-col gap-1">
            <p className="text-[length:var(--app-font-size-ui,12px)] font-medium text-foreground">
              Connect Google Calendar
            </p>
            <p className="text-[length:var(--app-font-size-ui,12px)] text-muted-foreground/80">
              Choose your installed OAuth client JSON once. Luminor keeps the grant and reads only
              your primary calendar.
            </p>
          </div>
          <Button type="button" size="sm" onClick={onConnect} disabled={connecting || !onConnect}>
            {connecting ? "Connecting…" : "Connect Google Calendar"}
          </Button>
          {connectError ? (
            <p className="text-[length:var(--app-font-size-ui,12px)] text-destructive" role="alert">
              {connectError}
            </p>
          ) : null}
        </section>
      </SidebarGroup>
    );
  }

  const sections = meetingsSidebarSections(workspace, now);

  return (
    <SidebarGroup className="px-1.5 py-1.5">
      <MeetingsSidebarSection
        section="live"
        sessions={sections.live}
        emptyLabel={sections.live.length === 0 ? EMPTY_SECTION_COPY.live : ""}
        selectedSessionId={workspace.selectedSessionId}
        onSelectSession={onSelectSession}
      />
      <MeetingsSidebarSection
        section="today"
        sessions={sections.today}
        emptyLabel={sections.today.length === 0 ? EMPTY_SECTION_COPY.today : ""}
        selectedSessionId={workspace.selectedSessionId}
        onSelectSession={onSelectSession}
      />
      <MeetingsSidebarSection
        section="ended"
        sessions={sections.ended}
        emptyLabel={sections.ended.length === 0 ? EMPTY_SECTION_COPY.ended : ""}
        selectedSessionId={workspace.selectedSessionId}
        onSelectSession={onSelectSession}
      />
    </SidebarGroup>
  );
}
