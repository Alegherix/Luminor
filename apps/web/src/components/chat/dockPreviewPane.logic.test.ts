import type { ThreadPreviewState } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import {
  PREVIEW_FAILED_HEADING,
  PREVIEW_IDLE_HEADING,
  PREVIEW_NEEDS_SCRIPT_HEADING,
  PREVIEW_NO_URL_HEADING,
  PREVIEW_REQUIRES_WORKTREE_HEADING,
  PREVIEW_STARTING_HEADING,
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
  it("explains the worktree requirement and offers no controls without one", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      hasWorktree: false,
      hasPreviewScript: true,
    });

    expect(view.controls).toEqual([]);
    expect(view.body).toMatchObject({
      kind: "message",
      heading: PREVIEW_REQUIRES_WORKTREE_HEADING,
      action: null,
    });
  });

  it("offers start while idle", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      hasWorktree: true,
      hasPreviewScript: true,
    });

    expect(view.status).toBe("idle");
    expect(view.tone).toBe("idle");
    expect(view.controls).toEqual(["start"]);
    expect(view.body).toMatchObject({ heading: PREVIEW_IDLE_HEADING, action: "start" });
  });

  it("asks for a preview command instead of a start control when none is configured", () => {
    const view = resolvePreviewPaneView({
      preview: null,
      hasWorktree: true,
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
      hasWorktree: true,
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
      hasWorktree: true,
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
      hasWorktree: true,
      hasPreviewScript: true,
    });

    expect(view.controls).toEqual(["logs", "restart", "stop"]);
    expect(view.body).toMatchObject({ kind: "url-entry", heading: PREVIEW_NO_URL_HEADING });
  });

  it("surfaces the failure message with retry", () => {
    const view = resolvePreviewPaneView({
      preview: preview({ status: "failed", message: "Error: port already in use" }),
      hasWorktree: true,
      hasPreviewScript: true,
    });

    expect(view.tone).toBe("failed");
    expect(view.controls).toEqual(["logs", "restart"]);
    expect(view.body).toMatchObject({
      heading: PREVIEW_FAILED_HEADING,
      description: "Error: port already in use",
      action: "retry",
    });
  });
});
