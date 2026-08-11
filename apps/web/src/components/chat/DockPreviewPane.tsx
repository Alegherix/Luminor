// FILE: DockPreviewPane.tsx
// Purpose: Right-dock pane that runs a thread's preview command in its worktree and
//          embeds the resulting URL.
// Layer: Chat right-dock UI
// Depends on: useThreadPreview (server-owned state machine), dockPreviewPane.logic
//             (state->render mapping), DockPaneHeader.
// Exports: DockPreviewPane

import { PREVIEW_TERMINAL_ID, type ThreadId } from "@luminor/contracts";
import { useCallback, useState } from "react";

import { useThreadPreview } from "~/hooks/useThreadPreview";
import { LoaderIcon, PlayIcon, RefreshCwIcon, StopIcon, TerminalIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { useRightDockStore } from "~/rightDockStore";
import { Button } from "../ui/button";
import { IconButton } from "../ui/icon-button";
import { DOCK_HEADER_ICON_BUTTON_CLASS } from "./chatHeaderControls";
import { DockPaneHeader } from "./DockPaneHeader";
import { PanelStateMessage } from "./PanelStateMessage";
import {
  resolvePreviewPaneView,
  type PreviewPaneBody,
  type PreviewPaneControlKind,
  type PreviewPaneStatusTone,
} from "./dockPreviewPane.logic";

const STATUS_DOT_CLASS: Record<PreviewPaneStatusTone, string> = {
  idle: "bg-muted-foreground/30",
  pending: "bg-amber-500/80",
  running: "bg-success",
  failed: "bg-destructive",
};

const CONTROL_LABELS: Record<PreviewPaneControlKind, string> = {
  start: "Start preview",
  cancel: "Cancel preview",
  reload: "Reload preview",
  logs: "Open preview logs",
  restart: "Restart preview",
  stop: "Stop preview",
  retry: "Retry preview",
};

// The embedded app gets everything a dev server needs while staying unable to
// navigate or unload the Luminor window that hosts it.
const PREVIEW_WEBVIEW_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";

const CONTROL_ICONS: Record<PreviewPaneControlKind, typeof PlayIcon> = {
  start: PlayIcon,
  cancel: XIcon,
  reload: RefreshCwIcon,
  logs: TerminalIcon,
  restart: RefreshCwIcon,
  stop: StopIcon,
  retry: RefreshCwIcon,
};

export function DockPreviewPane(props: {
  hostThreadId: ThreadId;
  hasWorktree: boolean;
  onClose?: (() => void) | undefined;
}) {
  const { preview, start, stop, restart } = useThreadPreview(props.hostThreadId);
  const openPane = useRightDockStore((state) => state.openPane);
  const [reloadKey, setReloadKey] = useState(0);
  const view = resolvePreviewPaneView({ preview, hasWorktree: props.hasWorktree });

  const runControl = useCallback(
    (kind: PreviewPaneControlKind) => {
      if (kind === "reload") {
        setReloadKey((current) => current + 1);
        return;
      }
      if (kind === "logs") {
        openPane(props.hostThreadId, {
          kind: "terminal",
          terminalThreadId: props.hostThreadId,
          terminalId: PREVIEW_TERMINAL_ID,
        });
        return;
      }
      if (kind === "restart") {
        void restart();
        return;
      }
      if (kind === "start" || kind === "retry") {
        void start();
        return;
      }
      void stop();
    },
    [openPane, props.hostThreadId, restart, start, stop],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <DockPaneHeader
        title={
          <span className="flex items-center gap-2">
            <span
              className={cn("size-1.5 rounded-full", STATUS_DOT_CLASS[view.tone])}
              aria-hidden
              data-testid="preview-status-dot"
              data-tone={view.tone}
            />
            Preview
            {view.portLabel ? (
              <span className="rounded-sm bg-secondary px-1 py-px font-mono text-[11px] text-muted-foreground">
                {view.portLabel}
              </span>
            ) : null}
          </span>
        }
        onClose={props.onClose}
        closeLabel="Close preview"
        actions={
          <>
            {view.status === "starting" ? (
              <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
            {view.controls.map((kind) => {
              const Icon = CONTROL_ICONS[kind];
              return (
                <IconButton
                  key={kind}
                  size="icon-xs"
                  variant="ghost"
                  label={CONTROL_LABELS[kind]}
                  tooltip={CONTROL_LABELS[kind]}
                  className={DOCK_HEADER_ICON_BUTTON_CLASS}
                  onClick={() => runControl(kind)}
                >
                  <Icon className="size-3.5" />
                </IconButton>
              );
            })}
          </>
        }
      />

      {view.body.kind === "webview" ? (
        <iframe
          key={`${view.body.url}:${reloadKey}`}
          title="Thread preview"
          src={view.body.url}
          sandbox={PREVIEW_WEBVIEW_SANDBOX}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          data-testid="preview-webview"
        />
      ) : (
        <PreviewPaneMessageBody body={view.body} onRunControl={runControl} />
      )}
    </div>
  );
}

function PreviewPaneMessageBody(props: {
  body: Extract<PreviewPaneBody, { kind: "message" }>;
  onRunControl: (kind: PreviewPaneControlKind) => void;
}) {
  const action = props.body.action;
  return (
    <PanelStateMessage fill="flex">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-foreground">{props.body.heading}</p>
        <p className="max-w-80 text-xs text-muted-foreground">{props.body.description}</p>
        {action ? (
          <Button size="sm" variant="secondary-outline" onClick={() => props.onRunControl(action)}>
            {CONTROL_LABELS[action]}
          </Button>
        ) : null}
      </div>
    </PanelStateMessage>
  );
}

export default DockPreviewPane;
