// FILE: statusBar/UsageStatusBar.tsx
// Purpose: Global bottom usage bar — one segment per signed-in usage-capable provider, opening
// the usage roster popover. Hidden entirely while no provider reports usage.
// Structure ported from Orca (https://github.com/stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc.).

import { useNavigate } from "@tanstack/react-router";

import type {
  AllProviderUsageSummaries,
  ProviderUsageSummaryEntry,
} from "~/hooks/useAllProviderUsageSummaries";
import { useUsageResetTick } from "~/hooks/useUsageResetTick";
import { providerUsageToneClassName } from "~/lib/providerUsageDisplay";
import { formatRateLimitResetDuration } from "~/lib/rateLimits";
import { cn } from "~/lib/utils";

import { ComposerPickerMenuPopup } from "../chat/ComposerPickerMenuPopup";
import { ProviderIcon } from "../ProviderIcon";
import { Menu, MenuTrigger } from "../ui/menu";
import { UsageRosterPanel } from "./UsageRosterPanel";

const SEGMENT_BAR_CLASS = "h-1 w-6 overflow-hidden rounded-full bg-muted";

function UsageStatusBarSegment({ entry }: { entry: ProviderUsageSummaryEntry }) {
  const resetsAt = entry.tightestRow?.resetsAt;
  const resetDuration = resetsAt ? formatRateLimitResetDuration(resetsAt) : null;

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <ProviderIcon provider={entry.provider} tone="header" className="size-3 shrink-0" />
      {entry.rows.map((row) => (
        <span key={row.id} className="flex items-center gap-1">
          <span className="tabular-nums">{row.remainingLabel}</span>
          <span className="text-muted-foreground">{row.label}</span>
          <span className={SEGMENT_BAR_CLASS}>
            <span
              className={cn(
                "block h-full rounded-full",
                providerUsageToneClassName(row.remainingTone),
              )}
              style={{ width: `${row.remainingPercent}%` }}
            />
          </span>
        </span>
      ))}
      {resetDuration ? (
        <span className="tabular-nums text-muted-foreground">{resetDuration}</span>
      ) : null}
    </span>
  );
}

export function UsageStatusBar({ usage }: { usage: AllProviderUsageSummaries }) {
  const navigate = useNavigate();
  const { visibleEntries, rosterEntries, isFetching, refresh } = usage;
  useUsageResetTick(
    visibleEntries.flatMap((entry) => entry.rows.map((row) => row.resetsAt ?? null)),
  );

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <footer className="relative z-20 flex h-6 shrink-0 items-center gap-3 border-t border-border/60 bg-[var(--app-shell-background)] px-2 text-[length:var(--app-font-size-chat-meta,10px)] text-foreground/80">
      <Menu modal={false}>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label="Provider usage"
              className="flex min-w-0 items-center gap-3 rounded-sm px-1 py-0.5 transition-colors hover:bg-muted/60"
            />
          }
        >
          {visibleEntries.map((entry) => (
            <UsageStatusBarSegment key={entry.provider} entry={entry} />
          ))}
        </MenuTrigger>
        <ComposerPickerMenuPopup align="start" side="top" className="w-72 min-w-72">
          <UsageRosterPanel
            entries={rosterEntries}
            isFetching={isFetching}
            onRefresh={refresh}
            onOpenUsageSettings={() => {
              void navigate({ to: "/settings", search: { section: "usage" } });
            }}
          />
        </ComposerPickerMenuPopup>
      </Menu>
    </footer>
  );
}
