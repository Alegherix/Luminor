import type {
  OrchestrationCheckpointSummary,
  OrchestrationEvent,
  OrchestrationMessage,
  OrchestrationPendingInteraction,
  OrchestrationProposedPlan,
  OrchestrationThread,
  OrchestrationThreadActivity,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadStreamItem,
} from "@luminor/contracts";

export type ThreadDetailState = {
  readonly snapshotSequence: number;
  readonly cursor: number;
  readonly thread: OrchestrationThread;
};

function upsertMessage(
  messages: readonly OrchestrationMessage[],
  next: OrchestrationMessage,
): OrchestrationMessage[] {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) return [...messages, next];
  return messages.map((message, messageIndex) =>
    messageIndex === index ? { ...message, ...next } : message,
  );
}

function upsertPlan(
  plans: readonly OrchestrationProposedPlan[],
  next: OrchestrationProposedPlan,
): OrchestrationProposedPlan[] {
  const index = plans.findIndex((plan) => plan.id === next.id);
  if (index === -1) return [...plans, next];
  return plans.map((plan, planIndex) => (planIndex === index ? next : plan));
}

function upsertCheckpoint(
  checkpoints: readonly OrchestrationCheckpointSummary[],
  next: OrchestrationCheckpointSummary,
): OrchestrationCheckpointSummary[] {
  const index = checkpoints.findIndex((item) => item.turnId === next.turnId);
  if (index === -1) return [...checkpoints, next];
  return checkpoints.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function upsertActivity(
  activities: readonly OrchestrationThreadActivity[],
  next: OrchestrationThreadActivity,
): OrchestrationThreadActivity[] {
  const index = activities.findIndex((item) => item.id === next.id);
  if (index === -1) return [...activities, next];
  return activities.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function definedEntries<T extends Record<string, unknown>>(value: T): Partial<T> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) next[key] = entry;
  }
  return next as Partial<T>;
}

function applyEvent(thread: OrchestrationThread, event: OrchestrationEvent): OrchestrationThread {
  switch (event.type) {
    case "thread.message-sent": {
      const payload = event.payload;
      const message: OrchestrationMessage = {
        id: payload.messageId,
        role: payload.role,
        text: payload.text,
        turnId: payload.turnId,
        streaming: payload.streaming,
        source: payload.source,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt,
        ...definedEntries({
          attachments: payload.attachments,
          skills: payload.skills,
          mentions: payload.mentions,
          dispatchMode: payload.dispatchMode,
          dispatchOrigin: payload.dispatchOrigin,
        }),
      };
      return { ...thread, messages: upsertMessage(thread.messages, message) };
    }
    case "thread.activity-appended":
      return { ...thread, activities: upsertActivity(thread.activities, event.payload.activity) };
    case "thread.proposed-plan-upserted":
      return {
        ...thread,
        proposedPlans: upsertPlan(thread.proposedPlans, event.payload.proposedPlan),
      };
    case "thread.turn-diff-completed": {
      const payload = event.payload;
      const checkpoint: OrchestrationCheckpointSummary = {
        turnId: payload.turnId,
        checkpointTurnCount: payload.checkpointTurnCount,
        checkpointRef: payload.checkpointRef,
        status: payload.status,
        files: payload.files,
        assistantMessageId: payload.assistantMessageId,
        completedAt: payload.completedAt,
      };
      return { ...thread, checkpoints: upsertCheckpoint(thread.checkpoints, checkpoint) };
    }
    case "thread.session-set":
      return { ...thread, session: event.payload.session };
    case "thread.meta-updated": {
      const payload = event.payload as Record<string, unknown>;
      const ignored = new Set(["threadId"]);
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(payload)) {
        if (!ignored.has(key) && value !== undefined && key in thread) {
          patch[key] = value;
        }
      }
      return { ...thread, ...patch };
    }
    case "thread.approval-response-requested":
    case "thread.user-input-response-requested": {
      const pending = thread.pendingInteractions ?? [];
      const requestId = event.payload.requestId;
      const remaining = pending.filter(
        (item: OrchestrationPendingInteraction) => item.requestId !== requestId,
      );
      return remaining.length === pending.length
        ? thread
        : { ...thread, pendingInteractions: remaining };
    }
    case "thread.turn-start-requested":
    case "thread.turn-queued":
      return thread.latestTurn
        ? { ...thread, latestTurn: { ...thread.latestTurn, state: "running" } }
        : thread;
    case "thread.turn-interrupt-requested":
      return thread.latestTurn
        ? { ...thread, latestTurn: { ...thread.latestTurn, state: "interrupted" } }
        : thread;
    default:
      return thread;
  }
}

export function applyThreadSnapshot(
  snapshot: OrchestrationThreadDetailSnapshot,
): ThreadDetailState {
  return {
    snapshotSequence: snapshot.snapshotSequence,
    cursor: snapshot.snapshotSequence,
    thread: snapshot.thread,
  };
}

export function applyThreadStreamItem(
  state: ThreadDetailState | null,
  item: OrchestrationThreadStreamItem,
): ThreadDetailState | null {
  if (item.kind === "snapshot") {
    return applyThreadSnapshot(item.snapshot);
  }
  if (!state) return null;
  if (item.event.sequence <= state.cursor) return state;
  return {
    snapshotSequence: state.snapshotSequence,
    cursor: item.event.sequence,
    thread: applyEvent(state.thread, item.event),
  };
}

export function openPendingInteractions(
  thread: OrchestrationThread,
): readonly OrchestrationPendingInteraction[] {
  return (thread.pendingInteractions ?? []).filter(
    (item) => item.status === "pending" || item.status === "retryable",
  );
}
