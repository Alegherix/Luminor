// FILE: threadPreviewStore.ts
// Purpose: Client-side projection of the server-owned thread preview registry, keyed by thread id.
// Layer: Web UI state
// Exports: useThreadPreviewStore plus the preview-state selector helpers.

import type { ThreadPreviewState } from "@luminor/contracts";
import { isActiveThreadPreview } from "@luminor/shared/preview/previewState";
import { create } from "zustand";

interface ThreadPreviewStoreState {
  previewsByThreadId: Record<string, ThreadPreviewState>;
  /** Replace the entire registry from an authoritative server snapshot. */
  replaceAll: (previews: ReadonlyArray<ThreadPreviewState>) => void;
  /**
   * Apply one status transition. An `idle` preview is untracked on the server,
   * so it is dropped here instead of stored, keeping "no entry" the single
   * representation of idle.
   */
  applyStatus: (preview: ThreadPreviewState) => void;
}

function indexByThreadId(
  previews: ReadonlyArray<ThreadPreviewState>,
): Record<string, ThreadPreviewState> {
  const next: Record<string, ThreadPreviewState> = {};
  for (const preview of previews) {
    if (preview.status === "idle") {
      continue;
    }
    next[preview.threadId] = preview;
  }
  return next;
}

export const useThreadPreviewStore = create<ThreadPreviewStoreState>((set) => ({
  previewsByThreadId: {},
  replaceAll: (previews) =>
    set(() => ({
      previewsByThreadId: indexByThreadId(previews),
    })),
  applyStatus: (preview) =>
    set((state) => {
      if (preview.status === "idle") {
        if (!state.previewsByThreadId[preview.threadId]) {
          return state;
        }
        const nextPreviewsByThreadId = { ...state.previewsByThreadId };
        delete nextPreviewsByThreadId[preview.threadId];
        return { previewsByThreadId: nextPreviewsByThreadId };
      }
      return {
        previewsByThreadId: {
          ...state.previewsByThreadId,
          [preview.threadId]: preview,
        },
      };
    }),
}));

export function selectThreadPreview(threadId: string) {
  return (state: ThreadPreviewStoreState): ThreadPreviewState | null =>
    state.previewsByThreadId[threadId] ?? null;
}

export function hasActiveThreadPreview(state: ThreadPreviewStoreState, threadId: string): boolean {
  return isActiveThreadPreview(state.previewsByThreadId[threadId]);
}
