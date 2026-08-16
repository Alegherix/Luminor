export const INITIAL_RECONNECT_RETRY_MS = 500;
export const MAX_RECONNECT_RETRY_MS = 5_000;

export function getReconnectRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(Math.trunc(attempt), 16));
  return Math.min(INITIAL_RECONNECT_RETRY_MS * 2 ** exponent, MAX_RECONNECT_RETRY_MS);
}
