import type {
  OrchestrationPendingInteraction,
  OrchestrationThreadActivity,
} from "@luminor/contracts";

import { strings } from "../../strings";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function describeApproval(
  interaction: OrchestrationPendingInteraction,
  activities: readonly OrchestrationThreadActivity[],
): { readonly title: string; readonly body: string | null } {
  const match = activities.slice().reverse().find((activity) => {
    if (activity.kind !== "approval.requested") return false;
    const payload = asRecord(activity.payload);
    return payload?.requestId === interaction.requestId;
  });
  if (!match) {
    return { title: strings.thread.approvalTitle, body: null };
  }
  const payload = asRecord(match.payload);
  const detail = typeof payload?.detail === "string" ? payload.detail.trim() : "";
  return {
    title: match.summary.trim() || strings.thread.approvalTitle,
    body: detail.length > 0 ? detail : null,
  };
}

export function openApprovals(
  pending: readonly OrchestrationPendingInteraction[],
): readonly OrchestrationPendingInteraction[] {
  return pending.filter((item) => item.interactionKind === "approval");
}
