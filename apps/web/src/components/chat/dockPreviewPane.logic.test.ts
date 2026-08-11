import type { ThreadPreviewState } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import {
  PREVIEW_FAILED_HEADING,
  PREVIEW_IDLE_HEADING,
  PREVIEW_NEEDS_SCRIPT_HEADING,
  PREVIEW_NO_URL_HEADING,
  PREVIEW_REQUIRES_WORKSPACE_HEADING,
  PREVIEW_STARTING_HEADING,
  PREVIEW_WORKTREE_PENDING_HEADING,
  resolvePreviewPaneView,
} from "./dockPreviewPane.logic";

const preview = (overrides: Partial<ThreadPreviewState>): ThreadPreviewState => ({
  threadId: "thread-1",
  status: "idle",
  terminalId: "preview",
  url: null,
  port: null,
  message: null,
  scriptId: null,
  command: null,
  cwd: null,
  startedAt: null,
  ...overrides,
});

describe("resolvePreviewPaneView", () => {
  it("explains the missing workspace and offers no controls", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      workspaceState: null,
      hasPreviewScript: true,
    });

    expect(view.controls).toEqual([]);
    expect(view.body).toMatchObject({
      kind: "message",
      heading: PREVIEW_REQUIRES_WORKSPACE_HEADING,
      action: null,
    });
  });

  it("offers start for a local thread, which runs in the project directory", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      workspaceState: "local",
      hasPreviewScript: true,
      previewCommand: "bun run dev",
    });

    expect(view.controls).toEqual(["configure", "start"]);
    expect(view.body).toMatchObject({ heading: PREVIEW_IDLE_HEADING, action: "start" });
  });

  it("waits for a worktree-mode thread whose worktree has not materialized", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      workspaceState: "worktree-pending",
      hasPreviewScript: true,
      previewCommand: "bun run dev",
    });

    expect(view.controls).toEqual([]);
    expect(view.body).toMatchObject({
      kind: "message",
      heading: PREVIEW_WORKTREE_PENDING_HEADING,
      action: null,
    });
  });

  it("offers start while idle", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      workspaceState: "worktree-ready",
      hasPreviewScript: true,
    });

    expect(view.status).toBe("idle");
    expect(view.tone).toBe("idle");
    expect(view.controls).toEqual(["configure", "start"]);
    expect(view.body).toMatchObject({ heading: PREVIEW_IDLE_HEADING, action: "start" });
  });

  it("shows the saved command as the idle description so it can be edited before starting", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      workspaceState: "worktree-ready",
      hasPreviewScript: true,
      previewCommand: "bun run dev --home-dir ./.luminor/preview-instance",
    });

    expect(view.body).toMatchObject({
      heading: PREVIEW_IDLE_HEADING,
      description: "bun run dev --home-dir ./.luminor/preview-instance",
    });
  });

  it("keeps the generic idle description when the saved command is blank", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      workspaceState: "worktree-ready",
      hasPreviewScript: true,
      previewCommand: "   ",
    });

    expect(view.body).toMatchObject({
      description: "Run the project's preview command in this thread's directory.",
    });
  });

  it("asks for a preview command instead of a start control when none is configured", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      workspaceState: "worktree-ready",
      hasPreviewScript: false,
    });

    expect(view.status).toBe("idle");
    expect(view.controls).toEqual([]);
    expect(view.body).toMatchObject({
      kind: "configure",
      heading: PREVIEW_NEEDS_SCRIPT_HEADING,
    });
  });

  it("shows the launching command and only a cancel control while starting", () => {
    const view = resolvePreviewPaneView({
      preview: preview({ status: "starting", command: "bun run dev" }),
      workspaceState: "worktree-ready",
      hasPreviewScript: true,
    });

    expect(view.tone).toBe("pending");
    expect(view.controls).toEqual(["cancel"]);
    expect(view.body).toMatchObject({
      heading: PREVIEW_STARTING_HEADING,
      description: "bun run dev",
    });
  });

  it("embeds the url and offers reload, logs, restart, and stop while running", () => {
    const view = resolvePreviewPaneView({
      preview: preview({ status: "running", url: "http://localhost:5173", port: 5173 }),
      workspaceState: "worktree-ready",
      hasPreviewScript: true,
    });

    expect(view.tone).toBe("running");
    expect(view.portLabel).toBe(":5173");
    expect(view.controls).toEqual(["reload", "logs", "restart", "stop"]);
    expect(view.body).toEqual({ kind: "webview", url: "http://localhost:5173" });
  });

  it("keeps a running preview without a url stoppable but shows no webview", () => {
    const view = resolvePreviewPaneView({
      preview: preview({ status: "running", url: null }),
      workspaceState: "worktree-ready",
      hasPreviewScript: true,
    });

    expect(view.controls).toEqual(["logs", "restart", "stop"]);
    expect(view.body).toMatchObject({ kind: "url-entry", heading: PREVIEW_NO_URL_HEADING });
  });

  it("surfaces the failure message with retry", () => {
    const view = resolvePreviewPaneView({
      preview: preview({ status: "failed", message: "Error: port already in use" }),
      workspaceState: "worktree-ready",
      hasPreviewScript: true,
    });

    expect(view.tone).toBe("failed");
    expect(view.controls).toEqual(["logs", "configure", "restart"]);
    expect(view.body).toMatchObject({
      heading: PREVIEW_FAILED_HEADING,
      description: "Error: port already in use",
      action: "retry",
    });
  });
});
