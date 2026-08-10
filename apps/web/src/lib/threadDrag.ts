// FILE: threadDrag.ts
// Purpose: Single source for the sidebar thread drag payload (MIME, serialization, parsing).
// Layer: Web client shared helper (sidebar drag sources, chat split drop zones, folder drop targets)
// Exports: THREAD_DRAG_MIME, ThreadDragPayload, writeThreadDragPayload, readThreadDragPayload, hasThreadDrag, threadDragPayloadThreadIds

import type { ThreadId } from "@luminor/contracts";

// Custom MIME so external file drops on the composer (which listen for `Files`) cannot trigger us.
export const THREAD_DRAG_MIME = "application/x-luminor-thread";

export interface ThreadDragPayload {
  /** Row the drag started on. Single-thread targets only need this. */
  threadId: ThreadId;
  /** Present when the drag carries a multi-selection; always includes `threadId`. */
  threadIds?: readonly ThreadId[];
}

export function writeThreadDragPayload(
  dataTransfer: DataTransfer,
  payload: ThreadDragPayload,
): void {
  dataTransfer.effectAllowed = "move";
  dataTransfer.setData(THREAD_DRAG_MIME, JSON.stringify(payload));
}

export function readThreadDragPayload(dataTransfer: DataTransfer): ThreadDragPayload | null {
  try {
    const raw = dataTransfer.getData(THREAD_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThreadDragPayload>;
    if (typeof parsed.threadId !== "string") return null;
    const threadIds = Array.isArray(parsed.threadIds)
      ? parsed.threadIds.filter((id): id is ThreadId => typeof id === "string")
      : [];
    return threadIds.length > 0
      ? { threadId: parsed.threadId as ThreadId, threadIds }
      : { threadId: parsed.threadId as ThreadId };
  } catch {
    return null;
  }
}

export function hasThreadDrag(types: readonly string[]): boolean {
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === THREAD_DRAG_MIME) return true;
  }
  return false;
}

export function threadDragPayloadThreadIds(payload: ThreadDragPayload): readonly ThreadId[] {
  return payload.threadIds && payload.threadIds.length > 0 ? payload.threadIds : [payload.threadId];
}
