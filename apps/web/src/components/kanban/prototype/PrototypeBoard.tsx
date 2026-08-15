// FILE: PrototypeBoard.tsx
// Purpose: Local mocked 3-column board used by every issues-sync variant.
// Layer: Kanban prototype UI

import { Badge } from "~/components/ui/badge";
import { RAISED_SURFACE_CHROME_CLASS_NAME } from "~/components/chat/composerPickerStyles";
import { cn } from "~/lib/utils";
import { KanbanStatusIcon } from "../KanbanStatusIcon";
import type { PrototypeBoardCard, PrototypeCardColumn } from "./issue-sync.types";

const COLUMN_LABELS: Record<PrototypeCardColumn, string> = {
  draft: "Draft",
  inProgress: "In Progress",
  done: "Done",
};

function PrototypeCard({ card }: { card: PrototypeBoardCard }) {
  const fromIssue = card.issueId !== null;
  const auto = card.source === "autopopulated";
  return (
    <article
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg bg-card/70 px-3 py-2.5 text-left",
        RAISED_SURFACE_CHROME_CLASS_NAME,
        "dark:border dark:border-white/[0.05]",
        auto && "border-dashed border-sky-400/40 dark:border-dashed dark:border-sky-400/35",
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <p className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug font-medium text-foreground/90">
          {card.title}
        </p>
        {fromIssue && card.issueNumber !== null ? (
          <Badge size="sm" variant={auto ? "info" : "outline"}>
            #{card.issueNumber}
          </Badge>
        ) : null}
      </div>
      {card.preview ? (
        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{card.preview}</p>
      ) : null}
      <p className="text-[11px] text-muted-foreground/70">{card.meta}</p>
    </article>
  );
}

export function PrototypeBoard({ cards }: { cards: readonly PrototypeBoardCard[] }) {
  const columns: PrototypeCardColumn[] = ["draft", "inProgress", "done"];
  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto px-4 pb-4">
      {columns.map((column) => {
        const columnCards = cards.filter((card) => card.column === column);
        return (
          <section key={column} className="flex min-h-0 min-w-64 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-2 px-1.5 pb-2">
              <h3 className="text-[13px] font-medium text-foreground/90">
                {COLUMN_LABELS[column]}
              </h3>
              <span className="text-xs text-muted-foreground/70">{columnCards.length}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <KanbanStatusIcon column={column} />
              </span>
            </header>
            <ul className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-1">
              {columnCards.map((card) => (
                <li key={card.id} className="list-none">
                  <PrototypeCard card={card} />
                </li>
              ))}
              {columnCards.length === 0 ? (
                <li className="list-none rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/60">
                  No cards
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
