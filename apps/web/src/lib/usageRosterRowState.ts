// FILE: usageRosterRowState.ts
// Purpose: Classify what a provider's usage roster row should show — real usage, a loading
// placeholder, a signed-out hint, an unavailable note, or an error — from the live snapshot
// status and the derived rows. Shared by the usage status bar and its roster popover.
// Ported from Orca (https://github.com/stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc.).

import type { ProviderUsageStatus } from "@luminor/contracts";

export type UsageRosterRowStateKind = "usage" | "loading" | "signed-out" | "unavailable" | "error";

export interface UsageRosterRowState {
  kind: UsageRosterRowStateKind;
  detail: string | undefined;
}

export function deriveUsageRosterRowState(input: {
  status: ProviderUsageStatus | undefined;
  detail: string | undefined;
  hasRows: boolean;
  isLoading: boolean;
}): UsageRosterRowState {
  const detail = input.detail?.trim() || undefined;
  if (input.hasRows) {
    return { kind: "usage", detail };
  }
  switch (input.status) {
    case "needs-auth":
      return { kind: "signed-out", detail };
    case "unsupported":
      return { kind: "unavailable", detail };
    case "error":
      return { kind: "error", detail };
    default:
      break;
  }
  return input.isLoading ? { kind: "loading", detail } : { kind: "unavailable", detail };
}

/** Only rows carrying real numbers earn a segment in the status bar. */
export function isUsageRosterRowVisible(state: UsageRosterRowState): boolean {
  return state.kind === "usage";
}
