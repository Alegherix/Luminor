// FILE: pendingTurnDispatch.ts
// Purpose: Cross-component signal that a thread has a composer turn dispatch
//          the thread event stream has not yet acknowledged.
// Layer: Web subscription utility
// Exports: mark/clear/has helpers consumed by ChatView and the EventRouter
//          catch-up watchdog.

import type { ThreadId } from "@synara/contracts";

// The catch-up watchdog otherwise re-syncs only threads the store already
// believes are busy. A lost `thread.session-set(running)` event corrupts
// exactly that belief, so the watchdog needs a signal that does not come from
// the store: "the composer dispatched a turn here and has seen no echo yet".
const pendingDispatchArmedAtByThreadId = new Map<ThreadId, number>();

// Upper bound on how long a pending dispatch keeps forcing catch-up work. The
// composer's own ack fallback clears its marker well before this; the age cap
// only guards against a marker leaking (e.g. the owning view unmounted without
// cleanup) turning into a permanent poll.
export const PENDING_TURN_DISPATCH_MAX_AGE_MS = 30_000;

export function markPendingTurnDispatch(threadId: ThreadId): void {
  pendingDispatchArmedAtByThreadId.set(threadId, Date.now());
}

export function clearPendingTurnDispatch(threadId: ThreadId): void {
  pendingDispatchArmedAtByThreadId.delete(threadId);
}

export function hasPendingTurnDispatch(threadId: ThreadId): boolean {
  const armedAt = pendingDispatchArmedAtByThreadId.get(threadId);
  if (armedAt === undefined) {
    return false;
  }
  if (Date.now() - armedAt > PENDING_TURN_DISPATCH_MAX_AGE_MS) {
    pendingDispatchArmedAtByThreadId.delete(threadId);
    return false;
  }
  return true;
}

export function resetPendingTurnDispatchesForTests(): void {
  pendingDispatchArmedAtByThreadId.clear();
}
