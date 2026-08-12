import { SidebarGroup } from "~/components/ui/sidebar";
import { SIDEBAR_SECTION_LABEL_CLASS_NAME } from "~/sidebarRowStyles";
import { meetingsSidebarSections, type MeetingsWorkspaceSnapshot } from "./meetingsWorkspace";

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

function MeetingsSidebarSection({
  section,
  emptyLabel,
}: {
  readonly section: "live" | "today" | "ended";
  readonly emptyLabel: string;
}) {
  return (
    <section className="my-1" aria-label={SECTION_LABELS[section]}>
      <div className="flex h-7 w-full min-w-0 items-center px-2 py-0.5">
        <span className={SIDEBAR_SECTION_LABEL_CLASS_NAME}>{SECTION_LABELS[section]}</span>
      </div>
      {emptyLabel ? (
        <p className="px-2 pt-1 pb-3 text-[length:var(--app-font-size-ui,12px)] text-muted-foreground/58">
          {emptyLabel}
        </p>
      ) : null}
    </section>
  );
}

export function MeetingsSidebarList({
  workspace,
}: {
  readonly workspace: MeetingsWorkspaceSnapshot;
}) {
  const sections = meetingsSidebarSections(workspace);

  return (
    <SidebarGroup className="px-1.5 py-1.5">
      <MeetingsSidebarSection
        section="live"
        emptyLabel={sections.live.length === 0 ? EMPTY_SECTION_COPY.live : ""}
      />
      <MeetingsSidebarSection
        section="today"
        emptyLabel={sections.today.length === 0 ? EMPTY_SECTION_COPY.today : ""}
      />
      <MeetingsSidebarSection
        section="ended"
        emptyLabel={sections.ended.length === 0 ? EMPTY_SECTION_COPY.ended : ""}
      />
    </SidebarGroup>
  );
}
