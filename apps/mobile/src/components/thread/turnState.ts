import type { OrchestrationLatestTurn, OrchestrationSession } from "@luminor/contracts";

import type { ThreadStatusKind } from "../../state/threadStatus";

export function isTurnRunning(
  latestTurn: OrchestrationLatestTurn | null,
  session: OrchestrationSession | null,
): boolean {
  if (session?.status === "running") return true;
  return latestTurn?.state === "running";
}

export function workingStartedAt(
  latestTurn: OrchestrationLatestTurn | null,
  session: OrchestrationSession | null,
): string | null {
  if (!isTurnRunning(latestTurn, session)) return null;
  return latestTurn?.startedAt ?? latestTurn?.requestedAt ?? session?.updatedAt ?? null;
}

export function sessionStatusKind(status: OrchestrationSession["status"]): ThreadStatusKind {
  switch (status) {
    case "running":
      return "running";
    case "starting":
      return "active";
    case "error":
      return "needs-attention";
    default:
      return "idle";
  }
}
