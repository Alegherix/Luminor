// FILE: PrototypeIssueRow.tsx
// Purpose: Clickable inbox row for the triage prototype.
// Layer: Kanban prototype UI

import { Badge } from "~/components/ui/badge";
import { RAISED_SURFACE_CHROME_CLASS_NAME } from "~/components/chat/composerPickerStyles";
import { cn } from "~/lib/utils";
import type { PrototypeIssue } from "./issue-sync.types";

function IssueGlyph({ state }: { state: PrototypeIssue["state"] }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0", state === "open" ? "text-emerald-500" : "text-violet-400")}
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

export function PrototypeIssueRow({
  issue,
  selected,
  onSelect,
}: {
  issue: PrototypeIssue;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg bg-card/70 px-3 py-2.5 text-left transition-colors",
        RAISED_SURFACE_CHROME_CLASS_NAME,
        "dark:border dark:border-white/[0.05]",
        "hover:bg-card focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        selected && "ring-1 ring-ring/70 bg-card",
      )}
    >
      <IssueGlyph state={issue.state} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground/90">
          {issue.title}
        </p>
        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/75">
          {issue.repo} #{issue.number}
          <span className="px-1 text-muted-foreground/40">·</span>
          {issue.assignee ?? "Unassigned"}
          <span className="px-1 text-muted-foreground/40">·</span>
          {issue.updatedAt}
          {issue.comments.length > 0 ? ` · ${issue.comments.length}` : ""}
        </p>
        {issue.labels.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {issue.labels.map((label) => (
              <Badge key={label} size="sm" variant="outline">
                {label}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}
