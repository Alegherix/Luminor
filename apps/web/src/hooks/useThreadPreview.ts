// FILE: useThreadPreview.ts
// Purpose: Single client-side entry point for a thread's preview state and its start/stop actions.
// Layer: Web preview controller hook
// Exports: useThreadPreview

import type { ThreadId, ThreadPreviewState } from "@luminor/contracts";
import { isActiveThreadPreview } from "@luminor/shared/preview/previewState";
import { useCallback, useEffect, useMemo } from "react";

import { toastManager } from "../components/ui/toast";
import { readNativeApi } from "../nativeApi";
import { selectThreadPreview, useThreadPreviewStore } from "../threadPreviewStore";

export interface ThreadPreviewController {
  readonly preview: ThreadPreviewState | null;
  readonly status: ThreadPreviewState["status"];
  readonly isActive: boolean;
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly restart: () => Promise<void>;
}

// Mirrors the server-owned preview registry into the client store for as long as
// a preview surface is mounted. The channel opens with a snapshot, and the
// explicit list() call covers a snapshot that landed before this subscription.
export function useThreadPreviewEvents(): void {
  useEffect(() => {
    const api = readNativeApi();
    if (!api) {
      return;
    }
    let disposed = false;
    const unsubscribe = api.preview.onStatusEvent((event) => {
      const store = useThreadPreviewStore.getState();
      if (event.type === "snapshot") {
        store.replaceAll(event.previews);
        return;
      }
      store.applyStatus(event.preview);
    });
    void api.preview
      .list()
      .then(({ previews }) => {
        if (disposed) {
          return;
        }
        useThreadPreviewStore.getState().replaceAll(previews);
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);
}

// Every preview transition is published by the server, so the actions only send
// intent: the store is updated from the `preview.status` channel, never locally.
export function useThreadPreview(threadId: ThreadId): ThreadPreviewController {
  useThreadPreviewEvents();
  const preview = useThreadPreviewStore(useMemo(() => selectThreadPreview(threadId), [threadId]));
  const applyStatus = useThreadPreviewStore((state) => state.applyStatus);

  const start = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      return;
    }
    try {
      const { preview: started } = await api.preview.start({ threadId });
      applyStatus(started);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to start preview",
        description:
          error instanceof Error ? error.message : "Unable to start the preview command.",
      });
    }
  }, [applyStatus, threadId]);

  const stop = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      return;
    }
    try {
      await api.preview.stop({ threadId });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to stop preview",
        description: error instanceof Error ? error.message : "Unable to stop the preview process.",
      });
    }
  }, [threadId]);

  const restart = useCallback(async () => {
    await stop();
    await start();
  }, [start, stop]);

  return {
    preview,
    status: preview?.status ?? "idle",
    isActive: isActiveThreadPreview(preview),
    start,
    stop,
    restart,
  };
}
