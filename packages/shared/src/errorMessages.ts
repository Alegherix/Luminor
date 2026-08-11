// FILE: errorMessages.ts
// Purpose: Normalizes nested Error-like values into readable messages.
// Layer: Shared utility
// Exports: collectErrorMessages, describeErrorMessage, describeUserFacingError,
//          isEffectFiberInterruptError, THREAD_NOT_ARCHIVED_INVARIANT_MARKER

// Stable phrase embedded in the server's "thread is not archived" orchestration
// invariant message. Shared so the server (which builds the message) and the
// client (which detects an Undo that raced another restore) reference one source
// of truth and cannot silently drift apart when the wording is edited.
export const THREAD_NOT_ARCHIVED_INVARIANT_MARKER = "is not archived for command";

// Effect's causeSquash message when a fiber exits with interrupt-only causes.
// Surfaces when a WebSocket reconnect/scope close cancels an in-flight RPC.
const EFFECT_FIBER_INTERRUPT_MESSAGE = "all fibers interrupted without error";

export const CONNECTION_INTERRUPTED_USER_MESSAGE =
  "Connection was interrupted. Please try again.";

export function collectErrorMessages(
  error: unknown,
  messages: string[] = [],
  seen = new Set<unknown>(),
): string[] {
  if (!error || seen.has(error)) return messages;
  seen.add(error);

  if (typeof error === "string") {
    const message = error.trim();
    if (message.length > 0) messages.push(message);
    return messages;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) messages.push(message);
    collectErrorMessages((error as { cause?: unknown }).cause, messages, seen);
    return messages;
  }

  if (typeof error === "object") {
    const value = error as { message?: unknown; cause?: unknown; name?: unknown };
    if (typeof value.message === "string") {
      const message = value.message.trim();
      if (message.length > 0) messages.push(message);
    }
    collectErrorMessages(value.cause, messages, seen);
  }

  return messages;
}

export function isEffectFiberInterruptError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "InterruptError") return true;
    if (error.message.toLowerCase().includes(EFFECT_FIBER_INTERRUPT_MESSAGE)) return true;
  }
  if (typeof error === "object" && error !== null) {
    const value = error as { name?: unknown; message?: unknown };
    if (value.name === "InterruptError") return true;
    if (
      typeof value.message === "string" &&
      value.message.toLowerCase().includes(EFFECT_FIBER_INTERRUPT_MESSAGE)
    ) {
      return true;
    }
  }
  if (typeof error === "string") {
    return error.toLowerCase().includes(EFFECT_FIBER_INTERRUPT_MESSAGE);
  }
  return false;
}

export function describeErrorMessage(error: unknown, fallbackMessage: string): string {
  const messages = collectErrorMessages(error);
  const uniqueMessages = messages.filter(
    (message, index) => messages.findIndex((candidate) => candidate === message) === index,
  );
  if (uniqueMessages.length === 0) return fallbackMessage;
  return uniqueMessages.join(": ");
}

/** Prefer a human-readable message; never surface Effect fiber-interrupt internals. */
export function describeUserFacingError(error: unknown, fallbackMessage: string): string {
  if (isEffectFiberInterruptError(error)) {
    return CONNECTION_INTERRUPTED_USER_MESSAGE;
  }
  const described = describeErrorMessage(error, fallbackMessage);
  if (described.toLowerCase().includes(EFFECT_FIBER_INTERRUPT_MESSAGE)) {
    return CONNECTION_INTERRUPTED_USER_MESSAGE;
  }
  return described;
}
