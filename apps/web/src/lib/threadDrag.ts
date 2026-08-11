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
  const serialized = JSON.stringify(payload);
  dataTransfer.setData(THREAD_DRAG_MIME, serialized);
  // Chromium/Electron often omits custom MIME types from `types` during dragover
  // unless a standard type is also present; keep a plain-text mirror for that.
  dataTransfer.setData("text/plain", serialized);
}

export function readThreadDragPayload(dataTransfer: DataTransfer): ThreadDragPayload | null {
  try {
    const raw = dataTransfer.getData(THREAD_DRAG_MIME) || dataTransfer.getData("text/plain");
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
  const mime = THREAD_DRAG_MIME.toLowerCase();
  for (let index = 0; index < types.length; index += 1) {
    if (types[index]?.toLowerCase() === mime) return true;
  }
  return false;
}

/**
 * Prefer MIME types when the browser exposes them; fall back to a same-window
 * drag marker because Chromium can hide custom types until drop.
 */
export function canAcceptThreadDrag(
  types: readonly string[],
  hasActiveLocalDrag: boolean,
): boolean {
  return hasActiveLocalDrag || hasThreadDrag(types);
}

export function threadDragPayloadThreadIds(payload: ThreadDragPayload): readonly ThreadId[] {
  return payload.threadIds && payload.threadIds.length > 0 ? payload.threadIds : [payload.threadId];
}
