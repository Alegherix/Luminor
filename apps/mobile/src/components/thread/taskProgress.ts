import type {
  OrchestrationProposedPlan,
  OrchestrationThreadActivity,
  TurnId,
} from "@luminor/contracts";

export type TaskProgressState = "done" | "current" | "pending";

export type TaskProgressItem = {
  readonly label: string;
  readonly state: TaskProgressState;
};

export type TaskProgressView = {
  readonly completed: number;
  readonly total: number;
  readonly items: readonly TaskProgressItem[];
  readonly at: string;
};

type ParsedTask = {
  readonly task: string;
  readonly status: "pending" | "inProgress" | "completed";
};

const TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[(x|X| )\]\s+(.*)$/;

export function parseTaskListTasks(payload: unknown): ParsedTask[] | null {
  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const rawTasks = record?.tasks;
  if (!Array.isArray(rawTasks)) return null;
  const tasks = rawTasks
    .map((entry): ParsedTask | null => {
      if (!entry || typeof entry !== "object") return null;
      const taskRecord = entry as Record<string, unknown>;
      if (typeof taskRecord.task !== "string" || taskRecord.task.trim().length === 0) {
        return null;
      }
      const status =
        taskRecord.status === "completed" || taskRecord.status === "inProgress"
          ? taskRecord.status
          : "pending";
      return { task: taskRecord.task, status };
    })
    .filter((task): task is ParsedTask => task !== null);
  if (rawTasks.length > 0 && tasks.length === 0) return null;
  return tasks;
}

function parsePlanChecklist(markdown: string): ParsedTask[] {
  return markdown
    .split("\n")
    .map((line) => TASK_LINE.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      task: (match[2] ?? "").trim(),
      status: match[1] === " " ? ("pending" as const) : ("completed" as const),
    }))
    .filter((task) => task.task.length > 0);
}

function toProgressItems(tasks: readonly ParsedTask[]): TaskProgressItem[] {
  let currentAssigned = false;
  return tasks.map((task) => {
    if (task.status === "completed") return { label: task.task, state: "done" };
    if (task.status === "inProgress" && !currentAssigned) {
      currentAssigned = true;
      return { label: task.task, state: "current" };
    }
    if (task.status === "pending" && !currentAssigned) {
      currentAssigned = true;
      return { label: task.task, state: "current" };
    }
    return { label: task.task, state: "pending" };
  });
}

function toView(tasks: readonly ParsedTask[], at: string): TaskProgressView | null {
  if (tasks.length === 0) return null;
  const items = toProgressItems(tasks);
  return {
    completed: items.filter((item) => item.state === "done").length,
    total: items.length,
    items,
    at,
  };
}

export function deriveTaskProgress(
  activities: readonly OrchestrationThreadActivity[],
  proposedPlans: readonly OrchestrationProposedPlan[],
  latestTurnId?: TurnId | null,
): TaskProgressView | null {
  const taskActivities = activities.filter((activity) => activity.kind === "turn.tasks.updated");
  const fromCurrentTurn = latestTurnId
    ? taskActivities.toReversed().find((activity) => activity.turnId === latestTurnId)
    : undefined;
  const latestTaskActivity = fromCurrentTurn ?? taskActivities[taskActivities.length - 1];
  if (latestTaskActivity) {
    const tasks = parseTaskListTasks(latestTaskActivity.payload);
    if (tasks && tasks.length > 0) {
      return toView(tasks, latestTaskActivity.createdAt);
    }
    if (tasks && tasks.length === 0) return null;
  }

  const latestPlan = proposedPlans.reduce<OrchestrationProposedPlan | null>((current, plan) => {
    if (!current) return plan;
    return plan.updatedAt >= current.updatedAt ? plan : current;
  }, null);
  if (!latestPlan) return null;
  return toView(parsePlanChecklist(latestPlan.planMarkdown), latestPlan.updatedAt);
}
