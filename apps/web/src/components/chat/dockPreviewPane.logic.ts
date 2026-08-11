// FILE: dockPreviewPane.logic.ts
// Purpose: Pure state->render mapping for the right-dock preview pane.
// Layer: Chat right-dock UI state helpers
// Exports: preview pane control/body descriptors and resolvePreviewPaneView.
//
// The pane renders exactly what this module returns, so new controls (restart,
// logs) or new body kinds (inline configuration) are added here and picked up by
// the pane's control/body renderers rather than by branching inside JSX.

import type { ThreadPreviewState, ThreadPreviewStatus } from "@luminor/contracts";

export type PreviewPaneControlKind =
  | "start"
  | "cancel"
  | "reload"
  | "logs"
  | "restart"
  | "stop"
  | "retry";

export type PreviewPaneStatusTone = "idle" | "pending" | "running" | "failed";

export type PreviewPaneBody =
  | { readonly kind: "webview"; readonly url: string }
  | {
      readonly kind: "url-entry";
      readonly heading: string;
      readonly description: string;
    }
  | {
      readonly kind: "message";
      readonly heading: string;
      readonly description: string;
      readonly action: PreviewPaneControlKind | null;
    }
  | { readonly kind: "configure"; readonly heading: string; readonly description: string };

export interface PreviewPaneView {
  readonly status: ThreadPreviewStatus;
  readonly tone: PreviewPaneStatusTone;
  readonly portLabel: string | null;
  readonly controls: readonly PreviewPaneControlKind[];
  readonly body: PreviewPaneBody;
}

const STATUS_TONES: Record<ThreadPreviewStatus, PreviewPaneStatusTone> = {
  idle: "idle",
  starting: "pending",
  running: "running",
  failed: "failed",
};

export const PREVIEW_REQUIRES_WORKTREE_HEADING = "Preview needs a worktree";
export const PREVIEW_IDLE_HEADING = "Preview is not running";
export const PREVIEW_STARTING_HEADING = "Starting preview";
export const PREVIEW_NO_URL_HEADING = "Preview is running";
export const PREVIEW_FAILED_HEADING = "Preview failed";
export const PREVIEW_NEEDS_SCRIPT_HEADING = "Set up the preview";

export function resolvePreviewPaneView(input: {
  readonly preview: ThreadPreviewState | null;
  readonly hasWorktree: boolean;
  readonly hasPreviewScript: boolean;
}): PreviewPaneView {
  const preview = input.preview;
  const status = preview?.status ?? "idle";
  const portLabel = preview?.port ? `:${preview.port}` : null;

  if (!input.hasWorktree) {
    return {
      status: "idle",
      tone: "idle",
      portLabel: null,
      controls: [],
      body: {
        kind: "message",
        heading: PREVIEW_REQUIRES_WORKTREE_HEADING,
        description: "This thread runs in the project directory, so there is nothing to preview.",
        action: null,
      },
    };
  }

  if (status === "starting") {
    return {
      status,
      tone: STATUS_TONES[status],
      portLabel,
      controls: ["cancel"],
      body: {
        kind: "message",
        heading: PREVIEW_STARTING_HEADING,
        description: preview?.command ?? "Launching the project's preview command.",
        action: null,
      },
    };
  }

  if (status === "running") {
    if (preview?.url) {
      return {
        status,
        tone: STATUS_TONES[status],
        portLabel,
        controls: ["reload", "logs", "restart", "stop"],
        body: { kind: "webview", url: preview.url },
      };
    }
    return {
      status,
      tone: STATUS_TONES[status],
      portLabel,
      controls: ["logs", "restart", "stop"],
      body: {
        kind: "url-entry",
        heading: PREVIEW_NO_URL_HEADING,
        description: "Enter the URL announced by the preview process.",
      },
    };
  }

  if (status === "failed") {
    return {
      status,
      tone: STATUS_TONES[status],
      portLabel,
      controls: ["logs", "restart"],
      body: {
        kind: "message",
        heading: PREVIEW_FAILED_HEADING,
        description: preview?.message ?? "The preview process exited.",
        action: "retry",
      },
    };
  }

  if (!input.hasPreviewScript) {
    return {
      status: "idle",
      tone: "idle",
      portLabel,
      controls: [],
      body: {
        kind: "configure",
        heading: PREVIEW_NEEDS_SCRIPT_HEADING,
        description:
          "Save the command that serves this project and it starts in this thread's worktree.",
      },
    };
  }

  return {
    status: "idle",
    tone: "idle",
    portLabel,
    controls: ["start"],
    body: {
      kind: "message",
      heading: PREVIEW_IDLE_HEADING,
      description: "Run the project's preview command in this thread's worktree.",
      action: "start",
    },
  };
}
