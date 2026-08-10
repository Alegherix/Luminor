// FILE: statusBar/UsageStatusBarShell.tsx
// Purpose: App-shell wrapper that reserves a row for the usage status bar and publishes its height
// as `--app-status-bar-height`, so the fixed full-height sidebar drawers end above the bar instead
// of covering it. Owns the single usage query the bar renders from.

import type { CSSProperties, ReactNode } from "react";

import { useAllProviderUsageSummaries } from "~/hooks/useAllProviderUsageSummaries";

import { UsageStatusBar } from "./UsageStatusBar";

const STATUS_BAR_HEIGHT_VAR = "--app-status-bar-height";
const STATUS_BAR_HEIGHT = "1.5rem";

export function UsageStatusBarShell({ children }: { children: ReactNode }) {
  const usage = useAllProviderUsageSummaries();
  const hasBar = usage.visibleEntries.length > 0;

  return (
    <div
      className="flex h-svh min-h-0 w-full min-w-0 flex-col"
      style={hasBar ? ({ [STATUS_BAR_HEIGHT_VAR]: STATUS_BAR_HEIGHT } as CSSProperties) : undefined}
    >
      <div className="relative flex min-h-0 w-full min-w-0 flex-1">{children}</div>
      {hasBar ? <UsageStatusBar usage={usage} /> : null}
    </div>
  );
}
