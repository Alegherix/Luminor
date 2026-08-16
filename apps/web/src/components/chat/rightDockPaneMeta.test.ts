import { describe, expect, it } from "vitest";

import { RIGHT_DOCK_PANE_KINDS } from "~/rightDockStore.logic";
import {
  PREVIEW_WORKTREE_PENDING_TOOLTIP,
  RIGHT_DOCK_ADD_MENU_KINDS,
  devicePaneLabel,
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

  it("gives the platform-neutral device kind its user-facing iOS label", () => {
    expect(getRightDockPaneMeta("device").label).toBe("iOS Simulator");
  });

  it("labels the device pane per server platform", () => {
    expect(devicePaneLabel("darwin")).toBe("iOS Simulator");
    expect(devicePaneLabel("linux")).toBe("Android Emulator");
    expect(devicePaneLabel(null)).toBe("Android Emulator");
  });
});

describe("resolveRightDockLauncherItems", () => {
  it("offers the non-Git tools for a chat without a repository", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: false,
        hasReview: false,
        isWorktreePending: false,
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
        isWorktreePending: false,
      }).map(({ kind }) => kind),
    ).toEqual(["diff", "terminal", "browser", "preview", "explorer", "sidechat", "git"]);
  });

  it("hides workspace-backed tools while no workspace is ready", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: false,
        hasGitRepository: false,
        hasReview: false,
        isWorktreePending: true,
      }).map(({ kind }) => kind),
    ).toEqual(["terminal", "browser", "preview", "sidechat"]);
  });

  it("hides review for a clean Git repository", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: true,
        hasReview: false,
        isWorktreePending: false,
      }).map(({ kind }) => kind),
    ).toEqual(["terminal", "browser", "preview", "explorer", "sidechat", "git"]);
  });

  it("keeps preview visible but disabled while the thread waits for its worktree", () => {
    const preview = resolveRightDockLauncherItems({
      hasWorkspace: true,
      hasGitRepository: true,
      hasReview: false,
      isWorktreePending: true,
    }).find((item) => item.kind === "preview");

    expect(preview?.disabled).toBe(true);
    expect(preview?.disabledReason).toBe(PREVIEW_WORKTREE_PENDING_TOOLTIP);
  });

  it("enables preview for a local thread, which previews the project directory", () => {
    const preview = resolveRightDockLauncherItems({
      hasWorkspace: true,
      hasGitRepository: true,
      hasReview: false,
      isWorktreePending: false,
    }).find((item) => item.kind === "preview");

    expect(preview?.disabled).toBeUndefined();
  });

  it("offers the simulator only when the server can host one", () => {
    // Off macOS there is nothing the user could do from this machine to make
    // simulators work, so the entry is hidden rather than shown disabled.
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: false,
        hasReview: false,
        isWorktreePending: false,
        hasDeviceSupport: true,
      }).map(({ kind }) => kind),
    ).toEqual(["terminal", "browser", "preview", "explorer", "sidechat", "device"]);

    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: false,
        hasReview: false,
        isWorktreePending: false,
        hasDeviceSupport: false,
      }).map(({ kind }) => kind),
    ).not.toContain("device");
  });

  it("omits the simulator when support is unknown, so the entry cannot flicker in", () => {
    expect(
      resolveRightDockLauncherItems({
        hasWorkspace: true,
        hasGitRepository: false,
        hasReview: false,
        isWorktreePending: false,
      }).map(({ kind }) => kind),
    ).not.toContain("device");
  });
});
