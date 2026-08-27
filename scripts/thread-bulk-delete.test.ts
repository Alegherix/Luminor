import { describe, expect, it } from "vitest";

import {
  buildThreadBulkDeletePlan,
  getOrphanedWorktreePathForDeletion,
  PR_PARITY_GAP_FOLDER,
  threadMatchesSelector,
  type ProjectionThreadRow,
  type ThreadBulkDeleteSelector,
} from "./lib/thread-bulk-delete.ts";
import { parseThreadBulkDeleteArgs } from "./lib/thread-bulk-delete-args.ts";

const THREADS: ReadonlyArray<ProjectionThreadRow> = [
  {
    threadId: "crash-1",
    title: "Process crashed: node",
    folderName: "Crashes",
    worktreePath: null,
    projectCwd: "/repo",
  },
  {
    threadId: "new-1",
    title: "New thread",
    folderName: null,
    worktreePath: null,
    projectCwd: "/repo",
  },
  {
    threadId: "parity-1",
    title: "PR list pane parity in sidebar",
    folderName: PR_PARITY_GAP_FOLDER,
    worktreePath: "/worktrees/a",
    projectCwd: "/repo",
  },
  {
    threadId: "parity-2",
    title: "PR row click opens right dock",
    folderName: PR_PARITY_GAP_FOLDER,
    worktreePath: "/worktrees/b",
    projectCwd: "/repo",
  },
  {
    threadId: "keep-1",
    title: "Real work",
    folderName: "Important",
    worktreePath: "/worktrees/shared",
    projectCwd: "/repo",
  },
  {
    threadId: "keep-2",
    title: "Also real",
    folderName: "Important",
    worktreePath: "/worktrees/shared",
    projectCwd: "/repo",
  },
];

const DEFAULT_SELECTOR: ThreadBulkDeleteSelector = {
  folders: ["Crashes", PR_PARITY_GAP_FOLDER],
  titles: ["New thread"],
  titleLikes: [],
  threadIds: [],
};

describe("thread bulk delete", () => {
  it("uses the default cleanup selector when no selector flags are passed", () => {
    expect(parseThreadBulkDeleteArgs([])).toEqual({
      dryRun: true,
      homeDir: undefined,
      stateSqlitePath: undefined,
      selector: DEFAULT_SELECTOR,
    });
  });

  it("matches folders, titles, and title-like patterns", () => {
    const selector: ThreadBulkDeleteSelector = {
      folders: ["Crashes"],
      titles: [],
      titleLikes: ["Process crashed:*"],
      threadIds: [],
    };
    expect(threadMatchesSelector(THREADS[0]!, selector)).toBe(true);
    expect(threadMatchesSelector(THREADS[4]!, selector)).toBe(false);
  });

  it("builds a delete plan for the default cleanup set", () => {
    const plan = buildThreadBulkDeletePlan(THREADS, DEFAULT_SELECTOR);
    expect(plan.candidates.map((candidate) => candidate.threadId)).toEqual([
      "new-1",
      "parity-1",
      "parity-2",
      "crash-1",
    ]);
    expect(plan.worktreesToRemove.map((worktree) => worktree.path)).toEqual([
      "/worktrees/a",
      "/worktrees/b",
    ]);
    expect(plan.survivingThreadCount).toBe(2);
  });

  it("keeps shared worktrees when at least one linked thread survives", () => {
    expect(
      getOrphanedWorktreePathForDeletion(THREADS, new Set(["keep-1"]), "keep-1"),
    ).toBeNull();
  });

  it("does not remove worktrees for matched threads outside the PR parity gap folder", () => {
    const threads: ReadonlyArray<ProjectionThreadRow> = [
      {
        threadId: "crash-with-wt",
        title: "Process crashed: node",
        folderName: "Crashes",
        worktreePath: "/worktrees/should-stay",
        projectCwd: "/repo",
      },
    ];
    const plan = buildThreadBulkDeletePlan(threads, {
      folders: ["Crashes"],
      titles: [],
      titleLikes: [],
      threadIds: [],
    });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.worktreesToRemove).toEqual([]);
    expect(plan.candidates[0]?.orphanedWorktreePath).toBeNull();
  });
});
