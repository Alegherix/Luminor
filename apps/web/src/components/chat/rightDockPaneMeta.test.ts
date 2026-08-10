import { describe, expect, it } from "vitest";

import { RIGHT_DOCK_PANE_KINDS } from "~/rightDockStore.logic";
import {
  PREVIEW_REQUIRES_WORKTREE_TOOLTIP,
  RIGHT_DOCK_ADD_MENU_KINDS,
  getRightDockPaneMeta,
  resolveRightDockLauncherItems,
} from "./rightDockPaneMeta";

describe("RIGHT_DOCK_ADD_MENU_KINDS", () => {
  it("offers the explorer pane but not the chat-driven file pane", () => {
    // The "+" menu surfaces the file-tree explorer; single-file preview tabs are
    // opened by clicking a file reference in chat, not from the add menu.
    expect(RIGHT_DOCK_ADD_MENU_KINDS).toContain("explorer");
    expect(RIGHT_DOCK_ADD_MENU_KINDS).not.toContain("file");
  });

  it("keeps the canonical kind order minus context-only panes", () => {
    expect([...RIGHT_DOCK_ADD_MENU_KINDS]).toEqual(
      RIGHT_DOCK_PANE_KINDS.filter((kind) => kind !== "file" && kind !== "pullRequest"),
    );
  });

  it("labels the explorer pane", () => {
    expect(getRightDockPaneMeta("explorer").label).toBe("Explorer");
  });
});

describe("resolveRightDockLauncherItems", () => {
  it("offers the non-Git tools for a chat without a repository", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: false,
        hasReview: false,
        hasWorktree: true,
      }).map(({ kind, label }) => [kind, label]),
    ).toEqual([
      ["terminal", "Terminal"],
      ["browser", "Browser"],
      ["preview", "Preview"],
      ["explorer", "Files"],
      ["sidechat", "Side chats"],
    ]);
  });

  it("adds review and source control only for Git repositories", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: true,
        hasReview: true,
        hasWorktree: true,
      }).map(({ kind }) => kind),
    ).toEqual(["diff", "terminal", "browser", "preview", "explorer", "sidechat", "git"]);
  });

  it("hides workspace-backed tools while no workspace is ready", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: false,
        hasGitRepository: false,
        hasReview: false,
        hasWorktree: false,
      }).map(({ kind }) => kind),
    ).toEqual(["terminal", "browser", "preview", "sidechat"]);
  });

  it("hides review for a clean Git repository", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: true,
        hasReview: false,
        hasWorktree: true,
      }).map(({ kind }) => kind),
    ).toEqual(["terminal", "browser", "preview", "explorer", "sidechat", "git"]);
  });

  it("keeps preview visible but disabled while the thread has no worktree", () => {
    const preview = resolveRightDockLauncherItems({
      hasWorkspace: true,
      hasGitRepository: true,
      hasReview: false,
      hasWorktree: false,
    }).find((item) => item.kind === "preview");

    expect(preview?.disabled).toBe(true);
    expect(preview?.disabledReason).toBe(PREVIEW_REQUIRES_WORKTREE_TOOLTIP);
  });

  it("enables preview once the thread has a worktree", () => {
    const preview = resolveRightDockLauncherItems({
      hasWorkspace: true,
      hasGitRepository: true,
      hasReview: false,
      hasWorktree: true,
    }).find((item) => item.kind === "preview");

    expect(preview?.disabled).toBeUndefined();
  });
});
