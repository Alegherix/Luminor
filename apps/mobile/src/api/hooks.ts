import { useEffect, useMemo, useSyncExternalStore } from "react";

import { getRuntime } from "./runtime";
import type { ConnectionSnapshot, ShellSnapshot, ThreadSnapshot } from "./types";

function subscribeMany(unsubscribes: ReadonlyArray<() => void>): () => void {
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

export function useConnection(): ConnectionSnapshot & {
  reconnect(): void;
  disconnect(): void;
} {
  const runtime = getRuntime();
  const snapshot = useSyncExternalStore(
    runtime.connection.subscribe,
    runtime.connection.getState,
    runtime.connection.getState,
  );
  return {
    ...snapshot,
    reconnect: () => runtime.reconnect(),
    disconnect: () => runtime.disconnect(),
  };
}

export function useShell(): ShellSnapshot {
  const runtime = getRuntime();
  const getSnapshot = () => runtime.getShellSnapshot();
  return useSyncExternalStore(
    (onStoreChange) =>
      subscribeMany([
        runtime.shell.subscribe(onStoreChange),
        runtime.lastVisited.subscribe(onStoreChange),
      ]),
    getSnapshot,
    getSnapshot,
  );
}

export function useThread(threadId: string): ThreadSnapshot & {
  markVisited(): void;
} {
  const runtime = getRuntime();
  useEffect(() => runtime.acquireThread(threadId), [runtime, threadId]);
  const getSnapshot = () => runtime.getThreadSnapshot(threadId);
  const snapshot = useSyncExternalStore(
    (onStoreChange) =>
      subscribeMany([
        runtime.threads.subscribe(onStoreChange),
        runtime.lastVisited.subscribe(onStoreChange),
      ]),
    getSnapshot,
    getSnapshot,
  );
  return useMemo(
    () => ({
      ...snapshot,
      markVisited: () => runtime.markThreadVisited(threadId),
    }),
    [runtime, snapshot, threadId],
  );
}
