import type {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationSession,
  OrchestrationThreadActivity,
} from "@luminor/contracts";

import type { TaskProgressView } from "./taskProgress";

export type ThreadFeedItem =
  | {
      readonly type: "message";
      readonly key: string;
      readonly at: string;
      readonly message: OrchestrationMessage;
    }
  | {
      readonly type: "activity";
      readonly key: string;
      readonly at: string;
      readonly activity: OrchestrationThreadActivity;
      readonly connectAbove: boolean;
      readonly connectBelow: boolean;
    }
  | {
      readonly type: "fileEdit";
      readonly key: string;
      readonly at: string;
      readonly edit: OrchestrationCheckpointSummary;
    }
  | {
      readonly type: "taskProgress";
      readonly key: string;
      readonly at: string;
      readonly progress: TaskProgressView;
    }
  | {
      readonly type: "session";
      readonly key: string;
      readonly at: string;
      readonly session: OrchestrationSession;
    };

type Sortable = {
  readonly type: ThreadFeedItem["type"];
  readonly key: string;
  readonly at: string;
};

function compareItems(left: Sortable, right: Sortable): number {
  if (left.at !== right.at) return left.at < right.at ? -1 : 1;
  return left.key < right.key ? -1 : 1;
}

export function buildThreadFeed(input: {
  readonly messages: readonly OrchestrationMessage[];
  readonly activities: readonly OrchestrationThreadActivity[];
  readonly fileEdits: readonly OrchestrationCheckpointSummary[];
  readonly taskProgress: TaskProgressView | null;
  readonly session: OrchestrationSession | null;
}): ThreadFeedItem[] {
  const hideTaskActivity = input.taskProgress !== null;
  const mixed: Exclude<ThreadFeedItem, { type: "session" }>[] = [
    ...input.messages.map((message) => ({
      type: "message" as const,
      key: `message:${message.id}`,
      at: message.createdAt,
      message,
    })),
    ...input.activities
      .filter((activity) => !(hideTaskActivity && activity.kind === "turn.tasks.updated"))
      .map((activity) => ({
        type: "activity" as const,
        key: `activity:${activity.id}`,
        at: activity.createdAt,
        activity,
        connectAbove: false,
        connectBelow: false,
      })),
    ...input.fileEdits
      .filter((edit) => edit.files.length > 0)
      .map((edit) => ({
        type: "fileEdit" as const,
        key: `file:${edit.turnId}`,
        at: edit.completedAt,
        edit,
      })),
  ];
  if (input.taskProgress) {
    mixed.push({
      type: "taskProgress",
      key: "task-progress",
      at: input.taskProgress.at,
      progress: input.taskProgress,
    });
  }
  const ordered = mixed.slice().sort(compareItems);
  const withConnectors = ordered.map((item, index) => {
    if (item.type !== "activity") return item;
    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    return {
      type: "activity" as const,
      key: item.key,
      at: item.at,
      activity: item.activity,
      connectAbove: previous?.type === "activity",
      connectBelow: next?.type === "activity",
    };
  });
  if (!input.session) return withConnectors;
  return [
    ...withConnectors,
    {
      type: "session",
      key: `session:${input.session.threadId}`,
      at: input.session.updatedAt,
      session: input.session,
    },
  ];
}

export function latestStreamingMessageId(messages: readonly OrchestrationMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.streaming) return message.id;
  }
  return null;
}
