// FILE: PrototypeIssueFilterMenu.tsx
// Purpose: Same filter-button pattern as the Kanban header — repo, GitHub state, labels.
// Layer: Kanban prototype UI

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
import {
  arePrototypeIssueFiltersActive,
  countActivePrototypeIssueFilterGroups,
  togglePrototypeFilterValue,
} from "./issue-sync.logic";
import type { PrototypeIssueFilters, PrototypeIssueState, PrototypeRepo } from "./issue-sync.types";
import { EMPTY_PROTOTYPE_ISSUE_FILTERS } from "./scenarios";

const ISSUE_STATES: ReadonlyArray<{ value: PrototypeIssueState; label: string }> = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

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

export function PrototypeIssueFilterMenu({
  filters,
  onChange,
  repos,
  labels,
}: {
  filters: PrototypeIssueFilters;
  onChange: (filters: PrototypeIssueFilters) => void;
  repos: ReadonlyArray<PrototypeRepo>;
  labels: readonly string[];
}) {
  const activeCount = countActivePrototypeIssueFilterGroups(filters);
  const filtersActive = activeCount > 0;
  const repoIds = repos.map((repo) => repo.id);

  return (
    <Menu keepOpenOnSubmenuInteraction>
      <IconButton
        render={<MenuTrigger />}
        variant="chrome-outline"
        size="icon-xs"
        label={
          filtersActive
            ? `Filter issues, ${activeCount} ${activeCount === 1 ? "filter" : "filters"} active`
            : "Filter issues"
        }
        tooltip="Filter issues"
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
          <MenuSub keepOpenOnFocusOut>
            <MenuSubTrigger>Repo</MenuSubTrigger>
            <ComposerPickerMenuSubPopup className="min-w-52">
              {repos.map((repo) => (
                <MenuCheckboxItem
                  key={repo.id}
                  checked={filters.repoIds.includes(repo.id)}
                  onCheckedChange={() => {
                    onChange({
                      ...filters,
                      repoIds: togglePrototypeFilterValue(filters.repoIds, repo.id),
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
                onSelectAll={() => onChange({ ...filters, repoIds: repoIds })}
                onClear={() => onChange({ ...filters, repoIds: [] })}
              />
            </ComposerPickerMenuSubPopup>
          </MenuSub>
          <MenuSub keepOpenOnFocusOut>
            <MenuSubTrigger>GitHub state</MenuSubTrigger>
            <ComposerPickerMenuSubPopup className="min-w-52">
              {ISSUE_STATES.map((state) => (
                <MenuCheckboxItem
                  key={state.value}
                  checked={filters.states.includes(state.value)}
                  onCheckedChange={() => {
                    onChange({
                      ...filters,
                      states: togglePrototypeFilterValue(filters.states, state.value),
                    });
                  }}
                >
                  {state.label}
                </MenuCheckboxItem>
              ))}
              <MenuSeparator />
              <FilterSelectActions
                onSelectAll={() =>
                  onChange({ ...filters, states: ISSUE_STATES.map((state) => state.value) })
                }
                onClear={() => onChange({ ...filters, states: [] })}
              />
            </ComposerPickerMenuSubPopup>
          </MenuSub>
          {labels.length > 0 ? (
            <MenuSub keepOpenOnFocusOut>
              <MenuSubTrigger>Label</MenuSubTrigger>
              <ComposerPickerMenuSubPopup className="min-w-52">
                {labels.map((label) => (
                  <MenuCheckboxItem
                    key={label}
                    checked={filters.labels.includes(label)}
                    onCheckedChange={() => {
                      onChange({
                        ...filters,
                        labels: togglePrototypeFilterValue(filters.labels, label),
                      });
                    }}
                  >
                    {label}
                  </MenuCheckboxItem>
                ))}
                <MenuSeparator />
                <FilterSelectActions
                  onSelectAll={() => onChange({ ...filters, labels: [...labels] })}
                  onClear={() => onChange({ ...filters, labels: [] })}
                />
              </ComposerPickerMenuSubPopup>
            </MenuSub>
          ) : null}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem
          disabled={!arePrototypeIssueFiltersActive(filters)}
          onClick={() => onChange(EMPTY_PROTOTYPE_ISSUE_FILTERS)}
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
