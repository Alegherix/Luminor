// FILE: KanbanFilterMenu.tsx
// Purpose: Kanban header filter control — bordered trigger plus repo/PR/work-state menus.
// Layer: Kanban UI
// Exports: KanbanFilterMenu

import {
  ComposerPickerMenuPopup,
  ComposerPickerMenuSubPopup,
} from "~/components/chat/ComposerPickerMenuPopup";
import { IconButton } from "~/components/ui/icon-button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { FilterIcon, FolderIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import {
  PR_STATE_PRESENTATION_ICONS,
  resolvePrStatePresentation,
} from "../pullRequest/pullRequestStatePresentation";
import { KanbanStatusIcon } from "./KanbanStatusIcon";
import {
  areKanbanFiltersActive,
  countActiveKanbanFilterGroups,
  EMPTY_KANBAN_BOARD_FILTERS,
  KANBAN_PR_FILTER_LABELS,
  KANBAN_PR_FILTER_STATES,
  KANBAN_WORK_FILTER_LABELS,
  KANBAN_WORK_FILTER_STATES,
  toggleKanbanFilterValue,
  type KanbanBoardFilters,
  type KanbanPrFilterState,
} from "./kanban.logic";

function prFilterIcon(state: KanbanPrFilterState) {
  if (state === "draft") {
    return resolvePrStatePresentation({ state: "open", isDraft: true });
  }
  if (state === "merged") {
    return resolvePrStatePresentation({ state: "merged" });
  }
  if (state === "blocked") {
    return resolvePrStatePresentation({ state: "open", mergeability: "conflicting" });
  }
  return resolvePrStatePresentation({ state: "open" });
}

function FilterCountBadge({ count }: { count: number }) {
  return (
    <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
      {count}
    </span>
  );
}

function FilterSelectActions({
  onSelectAll,
  onClear,
}: {
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1">
      <button
        type="button"
        className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
        onClick={onSelectAll}
      >
        Select all
      </button>
      <button
        type="button"
        className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}

export function KanbanFilterMenu({
  filters,
  onChange,
  repos,
}: {
  filters: KanbanBoardFilters;
  onChange: (filters: KanbanBoardFilters) => void;
  repos: ReadonlyArray<{ id: string; name: string }>;
}) {
  const activeCount = countActiveKanbanFilterGroups(filters);
  const filtersActive = areKanbanFiltersActive(filters);
  const repoIds = repos.map((repo) => repo.id);

  return (
    <Menu keepOpenOnSubmenuInteraction>
      <IconButton
        render={<MenuTrigger />}
        variant="chrome-outline"
        size="icon-xs"
        label={
          filtersActive
            ? `Filter board, ${activeCount} ${activeCount === 1 ? "filter" : "filters"} active`
            : "Filter board"
        }
        tooltip="Filter board"
        tooltipSide="bottom"
        className="relative dark:!border-white/15"
        aria-pressed={filtersActive}
      >
        <FilterIcon className="size-3.5" />
        {filtersActive ? (
          <span className="absolute -top-1 -right-1">
            <FilterCountBadge count={activeCount} />
          </span>
        ) : null}
      </IconButton>
      <ComposerPickerMenuPopup align="start" side="bottom" className="min-w-48">
        <MenuGroup>
          <MenuGroupLabel>Filters</MenuGroupLabel>
          {repos.length > 0 ? (
            <MenuSub keepOpenOnFocusOut>
              <MenuSubTrigger>Repo</MenuSubTrigger>
              <ComposerPickerMenuSubPopup className="min-w-52">
                {repos.map((repo) => (
                  <MenuCheckboxItem
                    key={repo.id}
                    checked={filters.projectIds.includes(repo.id)}
                    onCheckedChange={() => {
                      onChange({
                        ...filters,
                        projectIds: toggleKanbanFilterValue(filters.projectIds, repo.id),
                      });
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 truncate">{repo.name}</span>
                    </span>
                  </MenuCheckboxItem>
                ))}
                <MenuSeparator />
                <FilterSelectActions
                  onSelectAll={() => {
                    onChange({ ...filters, projectIds: repoIds });
                  }}
                  onClear={() => {
                    onChange({ ...filters, projectIds: [] });
                  }}
                />
              </ComposerPickerMenuSubPopup>
            </MenuSub>
          ) : null}
          <MenuSub keepOpenOnFocusOut>
            <MenuSubTrigger>PR state</MenuSubTrigger>
            <ComposerPickerMenuSubPopup className="min-w-52">
              {KANBAN_PR_FILTER_STATES.map((state) => {
                const presentation = prFilterIcon(state);
                const Icon = PR_STATE_PRESENTATION_ICONS[presentation.iconKind];
                return (
                  <MenuCheckboxItem
                    key={state}
                    checked={filters.prStates.includes(state)}
                    onCheckedChange={() => {
                      onChange({
                        ...filters,
                        prStates: toggleKanbanFilterValue(filters.prStates, state),
                      });
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon
                        className={cn("size-3.5 shrink-0", presentation.colorClass)}
                        aria-hidden
                      />
                      {KANBAN_PR_FILTER_LABELS[state]}
                    </span>
                  </MenuCheckboxItem>
                );
              })}
              <MenuSeparator />
              <FilterSelectActions
                onSelectAll={() => {
                  onChange({ ...filters, prStates: [...KANBAN_PR_FILTER_STATES] });
                }}
                onClear={() => {
                  onChange({ ...filters, prStates: [] });
                }}
              />
            </ComposerPickerMenuSubPopup>
          </MenuSub>
          <MenuSub keepOpenOnFocusOut>
            <MenuSubTrigger>Work state</MenuSubTrigger>
            <ComposerPickerMenuSubPopup className="min-w-52">
              {KANBAN_WORK_FILTER_STATES.map((state) => (
                <MenuCheckboxItem
                  key={state}
                  checked={filters.workStates.includes(state)}
                  onCheckedChange={() => {
                    onChange({
                      ...filters,
                      workStates: toggleKanbanFilterValue(filters.workStates, state),
                    });
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <KanbanStatusIcon
                      column={state === "working" ? "inProgress" : "done"}
                      className="size-3.5"
                    />
                    {KANBAN_WORK_FILTER_LABELS[state]}
                  </span>
                </MenuCheckboxItem>
              ))}
              <MenuSeparator />
              <FilterSelectActions
                onSelectAll={() => {
                  onChange({ ...filters, workStates: [...KANBAN_WORK_FILTER_STATES] });
                }}
                onClear={() => {
                  onChange({ ...filters, workStates: [] });
                }}
              />
            </ComposerPickerMenuSubPopup>
          </MenuSub>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem
          disabled={!filtersActive}
          onClick={() => {
            onChange(EMPTY_KANBAN_BOARD_FILTERS);
          }}
        >
          <span className="flex w-full items-center justify-between gap-3">
            Clear all filters
            {filtersActive ? <FilterCountBadge count={activeCount} /> : null}
          </span>
        </MenuItem>
      </ComposerPickerMenuPopup>
    </Menu>
  );
}
