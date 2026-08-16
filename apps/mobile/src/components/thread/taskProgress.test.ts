import type { OrchestrationProposedPlan, OrchestrationThreadActivity } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { deriveTaskProgress, parseTaskListTasks } from "./taskProgress";

function activity(
  overrides: Partial<OrchestrationThreadActivity> &
    Pick<OrchestrationThreadActivity, "id" | "kind" | "payload" | "createdAt">,
): OrchestrationThreadActivity {
  return {
    tone: "info",
    summary: "Tasks updated",
    turnId: null,
    ...overrides,
  };
}

describe("parseTaskListTasks", () => {
  it("reads completed, current, and pending rows", () => {
    expect(
      parseTaskListTasks({
        tasks: [
          { task: "Plan created", status: "completed" },
          { task: "Search codebase", status: "inProgress" },
          { task: "Run checks" },
        ],
      }),
    ).toEqual([
      { task: "Plan created", status: "completed" },
      { task: "Search codebase", status: "inProgress" },
      { task: "Run checks", status: "pending" },
    ]);
  });

  it("returns null when the payload has no tasks array", () => {
    expect(parseTaskListTasks({ explanation: "nope" })).toBeNull();
  });
});

describe("deriveTaskProgress", () => {
  it("prefers the latest turn.tasks.updated snapshot", () => {
    const progress = deriveTaskProgress(
      [
        activity({
          id: "a1" as OrchestrationThreadActivity["id"],
          kind: "turn.tasks.updated",
          createdAt: "2026-08-16T11:00:00.000Z",
          payload: { tasks: [{ task: "Old", status: "completed" }] },
        }),
        activity({
          id: "a2" as OrchestrationThreadActivity["id"],
          kind: "turn.tasks.updated",
          createdAt: "2026-08-16T11:10:00.000Z",
          payload: {
            tasks: [
              { task: "Done", status: "completed" },
              { task: "Now", status: "inProgress" },
              { task: "Later", status: "pending" },
            ],
          },
        }),
      ],
      [],
    );
    expect(progress).toEqual({
      completed: 1,
      total: 3,
      at: "2026-08-16T11:10:00.000Z",
      items: [
        { label: "Done", state: "done" },
        { label: "Now", state: "current" },
        { label: "Later", state: "pending" },
      ],
    });
  });

  it("falls back to GFM checkboxes on the latest proposed plan", () => {
    const plan = {
      id: "plan-1",
      turnId: null,
      planMarkdown: "# Ship\n\n- [x] Write tests\n- [ ] Land UI\n- [ ] Review\n",
      implementedAt: null,
      implementationThreadId: null,
      createdAt: "2026-08-16T10:00:00.000Z",
      updatedAt: "2026-08-16T10:30:00.000Z",
    } satisfies OrchestrationProposedPlan;
    const progress = deriveTaskProgress([], [plan]);
    expect(progress?.completed).toBe(1);
    expect(progress?.total).toBe(3);
    expect(progress?.items[1]?.state).toBe("current");
  });

  it("hides an explicit empty task snapshot", () => {
    expect(
      deriveTaskProgress(
        [
          activity({
            id: "a1" as OrchestrationThreadActivity["id"],
            kind: "turn.tasks.updated",
            createdAt: "2026-08-16T11:00:00.000Z",
            payload: { tasks: [] },
          }),
        ],
        [],
      ),
    ).toBeNull();
  });
});
