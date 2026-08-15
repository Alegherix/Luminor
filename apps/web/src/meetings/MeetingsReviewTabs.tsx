import { cn } from "~/lib/utils";

export type MeetingsReviewTab = "overview" | "transcript" | "notes";

export const MEETINGS_REVIEW_TAB_LABELS: Record<MeetingsReviewTab, string> = {
  overview: "Översikt",
  transcript: "Transkription",
  notes: "Anteckningar",
};

export function MeetingsReviewTabs({
  tab,
  onTabChange,
}: {
  readonly tab: MeetingsReviewTab;
  readonly onTabChange: (tab: MeetingsReviewTab) => void;
}) {
  return (
    <nav
      className="flex items-center gap-1 border-b border-[color:var(--color-border)]"
      aria-label="Mötesvyer"
    >
      {(Object.keys(MEETINGS_REVIEW_TAB_LABELS) as MeetingsReviewTab[]).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={tab === key}
          onClick={() => onTabChange(key)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
            tab === key
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {MEETINGS_REVIEW_TAB_LABELS[key]}
        </button>
      ))}
    </nav>
  );
}

export function meetingsReviewPanelHidden(active: MeetingsReviewTab, tab: MeetingsReviewTab): boolean {
  return active !== tab;
}
