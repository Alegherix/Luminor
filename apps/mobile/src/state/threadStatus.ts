import type {
  OrchestrationLatestTurn,
  OrchestrationPendingInteraction,
  OrchestrationSession,
} from "@luminor/contracts";

export type ThreadStatusKind = "active" | "idle" | "running" | "needs-attention";

export type ThreadStatusInput = {
  readonly latestTurn: OrchestrationLatestTurn | null;
  readonly session: OrchestrationSession | null;
  readonly hasPendingApprovals?: boolean | undefined;
  readonly hasPendingUserInput?: boolean | undefined;
  readonly pendingInteractions?: readonly OrchestrationPendingInteraction[] | undefined;
};

function canSessionAnswer(session: OrchestrationSession | null): boolean {
  if (!session) return true;
  return session.status !== "stopped" && session.status !== "error";
}

function hasOpenPendingInteraction(
  pendingInteractions: readonly OrchestrationPendingInteraction[] | undefined,
): boolean {
  if (!pendingInteractions) return false;
  return pendingInteractions.some(
    (item) => item.status === "pending" || item.status === "retryable",
  );
}

export function deriveThreadStatus(input: ThreadStatusInput): ThreadStatusKind {
  const pendingFromDetails = hasOpenPendingInteraction(input.pendingInteractions);
  const pendingFromFlags = input.hasPendingApprovals === true || input.hasPendingUserInput === true;
  if ((pendingFromDetails || pendingFromFlags) && canSessionAnswer(input.session)) {
    return "needs-attention";
  }
  if (input.session?.status === "running") {
    return "running";
  }
  if (input.latestTurn?.state === "running" || input.session?.status === "starting") {
    return "active";
  }
  return "idle";
}

export function hasUnseenCompletion(
  latestTurn: OrchestrationLatestTurn | null,
  lastVisitedAt: string | null,
): boolean {
  const completedAt = latestTurn?.completedAt;
  if (!completedAt) return false;
  if (!lastVisitedAt) return true;
  return completedAt > lastVisitedAt;
}
