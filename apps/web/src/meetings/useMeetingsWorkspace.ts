import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { createDesktopMeetingsCalendarHost } from "./desktopMeetingsCalendar";
import {
  createMeetingsWorkspace,
  IDLE_MEETINGS_WORKSPACE,
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
  });
  return sharedWorkspace;
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
} {
  const workspace = getSharedMeetingsWorkspace();
  const snapshot = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    () => IDLE_MEETINGS_WORKSPACE,
  );
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
  };
}
