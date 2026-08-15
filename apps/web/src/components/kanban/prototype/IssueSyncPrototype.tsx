// FILE: IssueSyncPrototype.tsx
// Purpose: Triage inbox for GitHub issues — read one, Accept as a real Kanban draft.
// Layer: Kanban prototype surface

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAppSettings } from "~/appSettings";
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
import { issuesListQueryOptions, issuesViewQueryOptions } from "~/lib/issueQueryOptions";
import { ArrowLeftIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { useStore } from "~/store";
import { useWorkspacePathsStore } from "~/workspacePathsStore";
import { PrototypeIssueDetail } from "./PrototypeIssueDetail";
import { PrototypeIssueFilterMenu } from "./PrototypeIssueFilterMenu";
import { PrototypeIssueRow } from "./PrototypeIssueRow";
import {
  collectPrototypeLabels,
  collectPrototypeRepos,
  filterPrototypeIssues,
  issuesListStateFromFilters,
  prototypeCommentsFromIssueComments,
  prototypeIssueFromListEntry,
} from "./issue-sync.logic";
import type { PrototypeIssue, PrototypeIssueFilters } from "./issue-sync.types";
import {
  acceptIssueAsKanbanDraft,
  markIssueSkipped,
  readHiddenIssueIds,
  resetSkippedIssues,
} from "./prototype-api";
import { EMPTY_PROTOTYPE_ISSUE_FILTERS } from "./scenarios";

export function IssueSyncPrototype() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const projects = useStore((state) => state.projects);
  const homeDir = useWorkspacePathsStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspacePathsStore((state) => state.chatWorkspaceRoot);
  const studioWorkspaceRoot = useWorkspacePathsStore((state) => state.studioWorkspaceRoot);
  const desktopTopBarTrafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();
  const desktopTopBarWindowControlsGutterClassName =
    useDesktopTopBarWindowControlsGutterClassName();

  const [filters, setFilters] = useState<PrototypeIssueFilters>(EMPTY_PROTOTYPE_ISSUE_FILTERS);
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => readHiddenIssueIds());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listState = issuesListStateFromFilters(filters.states);
  const listQuery = useQuery(issuesListQueryOptions(listState));
  const loadedIssues = useMemo(
    () => (listQuery.data?.entries ?? []).map((entry) => prototypeIssueFromListEntry(entry)),
    [listQuery.data?.entries],
  );
  const labels = useMemo(() => collectPrototypeLabels(loadedIssues), [loadedIssues]);
  const repos = useMemo(() => collectPrototypeRepos(loadedIssues), [loadedIssues]);
  const inboxIssues = useMemo(
    () => filterPrototypeIssues(loadedIssues, filters, new Set(hiddenIds)),
    [filters, hiddenIds, loadedIssues],
  );
  const selectedIssue = useMemo(
    () => inboxIssues.find((issue) => issue.id === selectedId) ?? inboxIssues[0] ?? null,
    [inboxIssues, selectedId],
  );
  const viewQuery = useQuery(
    issuesViewQueryOptions(
      selectedIssue ? { repository: selectedIssue.repoId, number: selectedIssue.number } : null,
    ),
  );
  const selectedIssueWithComments = useMemo(() => {
    if (!selectedIssue) return null;
    if (!viewQuery.data) return selectedIssue;
    return prototypeIssueFromListEntry(
      viewQuery.data.entry,
      prototypeCommentsFromIssueComments(viewQuery.data.comments),
    );
  }, [selectedIssue, viewQuery.data]);
  const listError =
    listQuery.error instanceof Error
      ? listQuery.error.message
      : listQuery.error
        ? "Failed to load GitHub issues."
        : null;

  const handleAccept = (issue: PrototypeIssue) => {
    const result = acceptIssueAsKanbanDraft({
      issue,
      projects,
      defaultProvider: settings.defaultProvider,
      workspacePaths: { homeDir, chatWorkspaceRoot, studioWorkspaceRoot },
    });
    if (!result.ok) {
      toastManager.add({ type: "error", title: result.reason });
      return;
    }
    setHiddenIds(readHiddenIssueIds());
    void navigate({ to: "/$threadId", params: { threadId: result.threadId } });
  };

  const handleSkip = (issue: PrototypeIssue) => {
    const remaining = inboxIssues.filter((candidate) => candidate.id !== issue.id);
    markIssueSkipped(issue.id);
    setHiddenIds(readHiddenIssueIds());
    setSelectedId(remaining[0]?.id ?? null);
  };

  const handleReset = () => {
    resetSkippedIssues();
    setHiddenIds(readHiddenIssueIds());
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
                repos={repos}
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
                Reset skips
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
              {listQuery.isPending ? (
                <li className="list-none px-3 py-8 text-center text-xs text-muted-foreground/60">
                  Loading GitHub issues…
                </li>
              ) : listError ? (
                <li className="list-none rounded-lg border border-dashed border-destructive/40 px-3 py-8 text-center text-xs text-destructive/80">
                  {listError}
                </li>
              ) : inboxIssues.length === 0 ? (
                <li className="list-none rounded-lg border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground/60">
                  {listQuery.data?.errors[0]?.message ??
                    "Inbox zero. Accepted issues are Drafts on the Kanban board."}
                </li>
              ) : null}
            </ul>
          </aside>
          <div className="min-h-0 min-w-0 flex-1">
            <PrototypeIssueDetail
              issue={selectedIssueWithComments}
              onAccept={handleAccept}
              onSkip={handleSkip}
            />
          </div>
        </div>
      </div>
    </RouteInsetSurface>
  );
}
