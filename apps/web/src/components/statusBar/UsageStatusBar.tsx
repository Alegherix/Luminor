// FILE: statusBar/UsageStatusBar.tsx
// Purpose: Global bottom status bar — provider usage segments on the left, live clock
// centered (MissionDeck-style). The usage menu opens the roster popover. The bar itself
// always renders so the clock stays available even when no provider reports usage.
// Structure ported from Orca (https://github.com/stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc.).

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { formatResourceCpu, formatResourceRss } from "@luminor/shared/resourceProcesses";

import type {
  AllProviderUsageSummaries,
  ProviderUsageSummaryEntry,
} from "~/hooks/useAllProviderUsageSummaries";
import { useNowMs } from "~/hooks/useNowMs";
import { useUsageResetTick } from "~/hooks/useUsageResetTick";
import { providerUsageToneClassName } from "~/lib/providerUsageDisplay";
import { formatRateLimitResetDuration } from "~/lib/rateLimits";
import {
  RESOURCE_PROCESSES_IDLE_REFETCH_INTERVAL_MS,
  serverResourceProcessesQueryOptions,
} from "~/lib/serverReactQuery";
import { formatStatusBarDateTime } from "~/lib/statusBarClock";
import { cn } from "~/lib/utils";

import { ComposerPickerMenuPopup } from "../chat/ComposerPickerMenuPopup";
import { ProviderIcon } from "../ProviderIcon";
import { Menu, MenuTrigger } from "../ui/menu";
import { ResourceManagerPanel } from "./ResourceManagerPanel";
import { UsageRosterPanel } from "./UsageRosterPanel";

const SEGMENT_BAR_CLASS = "h-1 w-6 overflow-hidden rounded-full bg-muted";
const CLOCK_UPDATE_INTERVAL_MS = 1_000;

function useStatusBarRightInset(dependencyKey: string) {
  const footerRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [rightInsetPx, setRightInsetPx] = useState(0);

  useEffect(() => {
    const footer = footerRef.current;
    const right = rightRef.current;
    if (!footer) {
      return;
    }

    const update = () => {
      if (!right || right.childElementCount === 0) {
        setRightInsetPx(0);
        return;
      }
      const footerRect = footer.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      setRightInsetPx(Math.max(0, Math.ceil(footerRect.right - rightRect.left)));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(footer);
    if (right) {
      observer.observe(right);
    }
    return () => observer.disconnect();
  }, [dependencyKey]);

  return { footerRef, rightRef, rightInsetPx };
}

function UsageStatusBarSegment({ entry }: { entry: ProviderUsageSummaryEntry }) {
  const resetsAt = entry.tightestRow?.resetsAt;
  const resetDuration = resetsAt ? formatRateLimitResetDuration(resetsAt) : null;

  return (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <ProviderIcon provider={entry.provider} tone="header" className="size-3 shrink-0" />
      {entry.rows.map((row) => (
        <span key={row.id} className="flex shrink-0 items-center gap-1 whitespace-nowrap">
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
        <span className="shrink-0 tabular-nums text-muted-foreground">{resetDuration}</span>
      ) : null}
    </span>
  );
}

function LiveClock({ className }: { className?: string }) {
  const nowMs = useNowMs(true, CLOCK_UPDATE_INTERVAL_MS);
  const current = new Date(nowMs);

  return (
    <time
      className={cn("tabular-nums text-muted-foreground", className)}
      dateTime={current.toISOString()}
      aria-label="Current time"
    >
      {formatStatusBarDateTime(current)}
    </time>
  );
}

export function UsageStatusBar({ usage }: { usage: AllProviderUsageSummaries }) {
  const navigate = useNavigate();
  const [resourceOpen, setResourceOpen] = useState(false);
  const { visibleEntries, rosterEntries, isFetching, refresh } = usage;
  const resources = useQuery(
    serverResourceProcessesQueryOptions({
      refetchInterval: RESOURCE_PROCESSES_IDLE_REFETCH_INTERVAL_MS,
    }),
  );
  useUsageResetTick(
    visibleEntries.flatMap((entry) => entry.rows.map((row) => row.resetsAt ?? null)),
  );
  const leftoverCount =
    resources.data?.groups.find((group) => group.group === "leftovers")?.children.length ?? 0;
  const showResources = resources.data?.supported !== false;
  const layoutKey = [
    visibleEntries.length,
    visibleEntries.map((entry) => entry.provider).join(","),
    showResources,
    resources.data?.totalCpu,
    resources.data?.totalRssMb,
    resources.isPending,
    resources.isError,
  ].join("\0");
  const { footerRef, rightRef, rightInsetPx } = useStatusBarRightInset(layoutKey);

  return (
    <footer
      ref={footerRef}
      className="relative z-20 h-6 shrink-0 overflow-hidden border-t border-border/60 bg-[var(--app-shell-background)] text-[length:var(--app-font-size-chat-meta,10px)] text-foreground/80"
    >
      {visibleEntries.length > 0 ? (
        <div
          className="absolute inset-y-0 left-0 z-10 flex items-center overflow-hidden pl-2"
          style={rightInsetPx > 0 ? { right: `${rightInsetPx}px` } : undefined}
        >
          <Menu modal={false}>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Provider usage"
                  className="flex w-max max-w-none flex-nowrap items-center gap-3 whitespace-nowrap rounded-sm px-1 py-0.5 transition-colors hover:bg-muted/60"
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
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <LiveClock className="rounded-sm bg-[var(--app-shell-background)] px-1.5" />
      </div>

      <div
        ref={rightRef}
        className="absolute inset-y-0 right-0 z-10 flex shrink-0 items-center justify-end pr-2"
      >
        {showResources ? (
          <Menu modal={false} onOpenChange={setResourceOpen}>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Resource manager"
                  className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-sm px-1 py-0.5 tabular-nums transition-colors hover:bg-muted/60"
                />
              }
            >
              {leftoverCount > 0 ? <span className="size-1.5 rounded-full bg-warning" /> : null}
              <span>
                {resources.isError
                  ? "—"
                  : resources.isPending
                    ? "…"
                    : formatResourceCpu(resources.data?.totalCpu ?? 0)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>
                {resources.isError
                  ? "RSS"
                  : resources.isPending
                    ? "…"
                    : formatResourceRss(resources.data?.totalRssMb ?? 0)}
              </span>
            </MenuTrigger>
            <ComposerPickerMenuPopup align="end" side="top" className="w-[28rem] min-w-[28rem] p-0">
              <ResourceManagerPanel open={resourceOpen} />
            </ComposerPickerMenuPopup>
          </Menu>
        ) : null}
      </div>
    </footer>
  );
}
