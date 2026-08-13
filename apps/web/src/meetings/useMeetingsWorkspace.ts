import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { createDesktopMeetingsCalendarHost } from "./desktopMeetingsCalendar";
import { createDesktopMeetingsEmbedHost } from "./desktopMeetingsEmbed";
import { createDesktopMeetingsExternalHost } from "./desktopMeetingsExternal";
import { createDesktopMeetingsRecordingHost } from "./desktopMeetingsRecording";
import {
  createMeetingsWorkspace,
  IDLE_MEETINGS_WORKSPACE,
  type MeetingReminder,
  type MeetingsWorkspace,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";

const MEETINGS_REFRESH_INTERVAL_MS = 60_000;

let sharedWorkspace: MeetingsWorkspace | null = null;
let refreshUsers = 0;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function getSharedMeetingsWorkspace(): MeetingsWorkspace {
  sharedWorkspace ??= createMeetingsWorkspace({
    calendar: createDesktopMeetingsCalendarHost(),
    embed: createDesktopMeetingsEmbedHost(),
    external: createDesktopMeetingsExternalHost(),
    recording: createDesktopMeetingsRecordingHost(),
  });
  return sharedWorkspace;
}

export function useMeetingsWorkspaceSnapshot(): MeetingsWorkspaceSnapshot {
  const workspace = getSharedMeetingsWorkspace();
  return useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    () => IDLE_MEETINGS_WORKSPACE,
  );
}

function startRefreshWhileOpen(workspace: MeetingsWorkspace): () => void {
  refreshUsers += 1;
  if (refreshUsers === 1) {
    void workspace.hydrate();
    refreshTimer = setInterval(() => {
      void workspace.refresh();
    }, MEETINGS_REFRESH_INTERVAL_MS);
  }
  return () => {
    refreshUsers -= 1;
    if (refreshUsers === 0 && refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
}

export function useMeetingsWorkspace(): {
  snapshot: MeetingsWorkspaceSnapshot;
  selectSession: (sessionId: string | null) => void;
  connect: () => Promise<void>;
  connecting: boolean;
  connectError: string | null;
  tick: () => void;
  acknowledgeReminder: (reminder: MeetingReminder) => void;
  joinFromReminder: (reminder: MeetingReminder) => Promise<void>;
  joinPastedUrl: (url: string) => Promise<void>;
  joinSession: (sessionId: string) => Promise<void>;
  leave: () => Promise<void>;
  hideEmbed: () => Promise<void>;
  showEmbed: () => Promise<void>;
} {
  const workspace = getSharedMeetingsWorkspace();
  const snapshot = useMeetingsWorkspaceSnapshot();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const connectInFlight = useRef(false);

  useEffect(() => startRefreshWhileOpen(workspace), [workspace]);

  const connect = useCallback(async () => {
    if (connectInFlight.current) {
      return;
    }
    connectInFlight.current = true;
    setConnecting(true);
    setConnectError(null);
    try {
      await workspace.connect();
    } catch (error) {
      setConnectError(
        error instanceof Error ? error.message : "Could not connect Google Calendar.",
      );
    } finally {
      connectInFlight.current = false;
      setConnecting(false);
    }
  }, [workspace]);

  return {
    snapshot,
    selectSession: workspace.selectSession,
    connect,
    connecting,
    connectError,
    tick: workspace.tick,
    acknowledgeReminder: workspace.acknowledgeReminder,
    joinFromReminder: workspace.joinFromReminder,
    joinPastedUrl: workspace.joinPastedUrl,
    joinSession: workspace.joinSession,
    leave: workspace.leave,
    hideEmbed: workspace.hideEmbed,
    showEmbed: workspace.showEmbed,
  };
}
