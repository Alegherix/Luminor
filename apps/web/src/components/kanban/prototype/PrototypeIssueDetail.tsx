// FILE: PrototypeIssueDetail.tsx
// Purpose: Selected triage issue — body, comments, and what Accept does.
// Layer: Kanban prototype UI

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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

export function PrototypeIssueDetail({
  issue,
  onAccept,
  onSkip,
}: {
  issue: PrototypeIssue | null;
  onAccept: (issue: PrototypeIssue) => void;
  onSkip: (issue: PrototypeIssue) => void;
}) {
  if (!issue) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-1 flex-col px-6 py-4">
        <p className="text-[13px] font-medium text-foreground/90">Issue</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground/75">
          Click an inbox row to read the issue and its comments.
        </p>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/75">
          <IssueGlyph state={issue.state} />
          <span>
            {issue.repo} #{issue.number}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="capitalize">{issue.state}</span>
        </div>
        <h3 className="mt-2 text-[15px] leading-snug font-medium text-foreground">{issue.title}</h3>
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          {issue.author}
          <span className="px-1 text-muted-foreground/40">·</span>
          {issue.assignee ?? "Unassigned"}
          <span className="px-1 text-muted-foreground/40">·</span>
          {issue.updatedAt}
        </p>
        {issue.labels.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {issue.labels.map((label) => (
              <Badge key={label} size="sm" variant="outline">
                {label}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">
          {issue.body}
        </p>
        {issue.comments.length > 0 ? (
          <div className="mt-5 flex flex-col gap-2">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
              Comments
            </p>
            {issue.comments.map((comment) => (
              <div
                key={comment.id}
                className={cn(
                  "rounded-lg bg-card/70 px-3 py-2.5",
                  RAISED_SURFACE_CHROME_CLASS_NAME,
                  "dark:border dark:border-white/[0.05]",
                )}
              >
                <p className="text-[11px] text-muted-foreground/70">
                  {comment.author}
                  <span className="px-1 text-muted-foreground/40">·</span>
                  {comment.updatedAt}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">
                  {comment.body}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
        <Button size="sm" variant="ghost" onClick={() => onSkip(issue)}>
          Skip
        </Button>
        <Button size="sm" onClick={() => onAccept(issue)}>
          Accept
        </Button>
      </div>
    </aside>
  );
}
