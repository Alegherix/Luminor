// FILE: statusBar/UsageRosterPanel.tsx
// Purpose: Usage roster popover for the status bar — one row per provider with its windows,
// reset countdown, a refresh action, and a link into Settings → Usage.
// Structure ported from Orca (https://github.com/stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc.).

import { providerUsageDisplayName } from "@luminor/shared/providerUsage";

import type { ProviderUsageSummaryEntry } from "~/hooks/useAllProviderUsageSummaries";
import { ChevronRightIcon, RefreshCwIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import { ProviderIcon } from "../ProviderIcon";
import { ProviderUsageLimitRows } from "../ProviderUsageLimitRows";
import { MenuItem } from "../ui/menu";

const META_TEXT_CLASS = "text-[length:var(--app-font-size-chat-meta,10px)]";

function rosterRowFallback(entry: ProviderUsageSummaryEntry): string {
  if (entry.state.detail) {
    return entry.state.detail;
  }
  switch (entry.state.kind) {
    case "loading":
      return "Reading usage…";
    case "error":
      return "Usage could not be read.";
    default:
      return "No usage reported.";
  }
}

function UsageRosterRow({ entry }: { entry: ProviderUsageSummaryEntry }) {
  const resetText = entry.tightestRow?.resetText ?? null;

  return (
    <div className="space-y-1.5 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <ProviderIcon provider={entry.provider} tone="header" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {providerUsageDisplayName(entry.provider)}
        </span>
        {resetText ? (
          <span className={cn(META_TEXT_CLASS, "shrink-0 tabular-nums text-muted-foreground")}>
            {resetText}
          </span>
        ) : null}
      </div>
      {entry.rows.length > 0 ? (
        <ProviderUsageLimitRows rows={entry.rows} surface="popover" />
      ) : (
        <p className={cn(META_TEXT_CLASS, "leading-relaxed text-muted-foreground")}>
          {rosterRowFallback(entry)}
        </p>
      )}
    </div>
  );
}

export function UsageRosterPanel({
  entries,
  isFetching,
  onRefresh,
  onOpenUsageSettings,
}: {
  entries: ReadonlyArray<ProviderUsageSummaryEntry>;
  isFetching: boolean;
  onRefresh: () => void;
  onOpenUsageSettings: () => void;
}) {
  return (
    <div className="space-y-1 py-1">
      <div className="flex items-center gap-2 px-2">
        <span className={cn(META_TEXT_CLASS, "flex-1 font-medium text-muted-foreground")}>
          Usage
        </span>
        <button
          type="button"
          aria-label="Refresh usage"
          className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          onClick={(event) => {
            event.preventDefault();
            onRefresh();
          }}
        >
          <RefreshCwIcon className={cn("size-3", isFetching && "animate-spin")} />
        </button>
      </div>
      {entries.length === 0 ? (
        <p className={cn(META_TEXT_CLASS, "px-2 py-1 leading-relaxed text-muted-foreground")}>
          No signed-in provider reports usage.
        </p>
      ) : (
        entries.map((entry) => <UsageRosterRow key={entry.provider} entry={entry} />)
      )}
      <MenuItem onClick={onOpenUsageSettings}>
        <span className="flex-1">Usage details</span>
        <ChevronRightIcon className="size-3 text-muted-foreground" />
      </MenuItem>
    </div>
  );
}
