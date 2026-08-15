// FILE: IssueSyncPrototype.tsx
// Purpose: Triage inbox for GitHub issues — read one, Accept as a Kanban draft.
// Layer: Kanban prototype surface

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { SidebarHeaderNavigationControls } from "~/components/SidebarHeaderNavigationControls";
import { RouteInsetSurface } from "~/components/RouteInsetSurface";
import {
  CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
  CHAT_SURFACE_HEADER_HEIGHT_CLASS,
  CHAT_SURFACE_HEADER_PADDING_X_CLASS,
} from "~/components/chat/chatHeaderControls";
import { CHAT_BACKGROUND_CLASS_NAME } from "~/components/chat/composerPickerStyles";
import { Button } from "~/components/ui/button";
import { SearchInput } from "~/components/ui/search-input";
import { toastManager } from "~/components/ui/toast";
import {
  useDesktopTopBarTrafficLightGutterClassName,
  useDesktopTopBarWindowControlsGutterClassName,
} from "~/hooks/useDesktopTopBarGutter";
import { ArrowLeftIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { PrototypeBoard } from "./PrototypeBoard";
import { PrototypeIssueDetail } from "./PrototypeIssueDetail";
import { PrototypeIssueFilterMenu } from "./PrototypeIssueFilterMenu";
import { PrototypeIssueRow } from "./PrototypeIssueRow";
import {
  addIssuesAsDrafts,
  collectPrototypeLabels,
  filterPrototypeIssues,
  issueIdsOnBoard,
} from "./issue-sync.logic";
import type { PrototypeBoardCard, PrototypeIssue, PrototypeIssueFilters } from "./issue-sync.types";
import {
  EMPTY_PROTOTYPE_ISSUE_FILTERS,
  PROTOTYPE_ISSUES,
  PROTOTYPE_REPOS,
  SEED_PROTOTYPE_BOARD_CARDS,
} from "./scenarios";

export function IssueSyncPrototype() {
  const navigate = useNavigate();
  const desktopTopBarTrafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();
  const desktopTopBarWindowControlsGutterClassName =
    useDesktopTopBarWindowControlsGutterClassName();

  const [filters, setFilters] = useState<PrototypeIssueFilters>(EMPTY_PROTOTYPE_ISSUE_FILTERS);
  const [cards, setCards] = useState<PrototypeBoardCard[]>(() => [...SEED_PROTOTYPE_BOARD_CARDS]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const labels = useMemo(() => collectPrototypeLabels(PROTOTYPE_ISSUES), []);
  const onBoardIds = useMemo(() => issueIdsOnBoard(cards), [cards]);
  const inboxIssues = useMemo(
    () => filterPrototypeIssues(PROTOTYPE_ISSUES, filters, new Set([...hiddenIds, ...onBoardIds])),
    [filters, hiddenIds, onBoardIds],
  );
  const selectedIssue = useMemo(
    () => inboxIssues.find((issue) => issue.id === selectedId) ?? inboxIssues[0] ?? null,
    [inboxIssues, selectedId],
  );

  const handleAccept = (issue: PrototypeIssue) => {
    const remaining = inboxIssues.filter((candidate) => candidate.id !== issue.id);
    setCards(addIssuesAsDrafts(cards, [issue], "accepted"));
    setHiddenIds((current) => current.filter((id) => id !== issue.id));
    setSelectedId(remaining[0]?.id ?? null);
    toastManager.add({
      type: "success",
      title: "Parked in Draft",
      description: `${issue.repo} #${issue.number} — still linked, not started.`,
    });
  };

  const handleSkip = (issue: PrototypeIssue) => {
    const remaining = inboxIssues.filter((candidate) => candidate.id !== issue.id);
    setHiddenIds((current) => (current.includes(issue.id) ? current : [...current, issue.id]));
    setSelectedId(remaining[0]?.id ?? null);
  };

  const handleReset = () => {
    setCards([...SEED_PROTOTYPE_BOARD_CARDS]);
    setHiddenIds([]);
    setFilters(EMPTY_PROTOTYPE_ISSUE_FILTERS);
    setSelectedId(null);
  };

  return (
    <RouteInsetSurface>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          CHAT_BACKGROUND_CLASS_NAME,
        )}
      >
        <header
          className={cn(
            CHAT_SURFACE_HEADER_DIVIDER_CLASS_NAME,
            CHAT_SURFACE_HEADER_PADDING_X_CLASS,
            "drag-region",
            desktopTopBarTrafficLightGutterClassName,
            desktopTopBarWindowControlsGutterClassName,
          )}
        >
          <div className={cn("flex items-center gap-2 sm:gap-3", CHAT_SURFACE_HEADER_HEIGHT_CLASS)}>
            <SidebarHeaderNavigationControls />
            <div className="flex min-w-0 flex-1 items-center gap-2 [-webkit-app-region:no-drag]">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => {
                  void navigate({ to: "/kanban", search: {} });
                }}
                aria-label="Back to Kanban"
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>
              <h2 className="truncate text-sm font-medium text-foreground">Issue inbox</h2>
              <span className="shrink-0 text-xs text-muted-foreground/70">
                {inboxIssues.length}
              </span>
              <PrototypeIssueFilterMenu
                filters={filters}
                onChange={setFilters}
                repos={PROTOTYPE_REPOS}
                labels={labels}
              />
              <div className="min-w-40 max-w-64 flex-1">
                <SearchInput
                  value={filters.query}
                  onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                  placeholder="Search issues"
                  aria-label="Search issues"
                />
              </div>
              <Button size="xs" variant="ghost" className="ml-auto" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1">
          <aside className="flex w-[22rem] shrink-0 flex-col border-r border-border/60 px-3 pt-3">
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4">
              {inboxIssues.map((issue) => (
                <li key={issue.id} className="list-none">
                  <PrototypeIssueRow
                    issue={issue}
                    selected={issue.id === selectedIssue?.id}
                    onSelect={() => setSelectedId(issue.id)}
                  />
                </li>
              ))}
              {inboxIssues.length === 0 ? (
                <li className="list-none rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground/60">
                  Inbox zero. Accepted issues are Drafts on the board.
                </li>
              ) : null}
            </ul>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3">
            <p className="px-4 pb-2 text-[11px] text-muted-foreground/70">
              Columns are Kanban work states. GitHub stays a source on the card.
            </p>
            <div className="min-h-0 min-w-0 flex-1">
              <PrototypeBoard cards={cards} />
            </div>
          </div>
          <PrototypeIssueDetail issue={selectedIssue} onAccept={handleAccept} onSkip={handleSkip} />
        </div>
      </div>
    </RouteInsetSurface>
  );
}
