// FILE: usageResetCountdown.ts
// Purpose: Boundary-aligned tick scheduling for usage reset countdowns, so a countdown
// label refreshes exactly when its rendered unit changes instead of on a fixed interval.
// Ported from Orca (https://github.com/stablyai/orca, MIT, Copyright (c) 2026 Lovecast Inc.).
// Layer: cross-cutting (no runtime deps).

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Compact remaining-time label for a usage window: "47m", "3h 54m", "6d 7h". Null once the
 * window has elapsed (or is under a minute), so callers can pick their own "resets now" copy.
 */
export function formatUsageResetDuration(remainingMs: number): string | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return null;
  }
  const totalMinutes = Math.floor(remainingMs / MINUTE_MS);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return null;
}

/**
 * Delay in ms until the earliest countdown label among `resetTimesMs` changes. Countdowns a day
 * or more out are rendered in whole hours, so they only need an hourly tick; everything else
 * ticks on the minute. Expired or unparsable resets are ignored; with none left the caller still
 * gets a minute tick so an "expired" label can settle.
 */
export function getResetCountdownNextTickDelay(
  nowMs: number,
  resetTimesMs: ReadonlyArray<number>,
): number {
  let delay: number | null = null;
  for (const resetMs of resetTimesMs) {
    if (!Number.isFinite(resetMs)) {
      continue;
    }
    const remainingMs = resetMs - nowMs;
    if (remainingMs <= 0) {
      continue;
    }
    const tickUnitMs = remainingMs >= DAY_MS ? HOUR_MS : MINUTE_MS;
    const candidate = (remainingMs % tickUnitMs) + 1;
    if (delay === null || candidate < delay) {
      delay = candidate;
    }
  }
  return delay ?? MINUTE_MS;
}

/** Same as `getResetCountdownNextTickDelay`, for ISO timestamps as carried by usage snapshots. */
export function getResetCountdownNextTickDelayForIso(
  nowMs: number,
  resetTimes: ReadonlyArray<string | null | undefined>,
): number {
  const parsed: number[] = [];
  for (const value of resetTimes) {
    if (!value) {
      continue;
    }
    const millis = Date.parse(value);
    if (!Number.isNaN(millis)) {
      parsed.push(millis);
    }
  }
  return getResetCountdownNextTickDelay(nowMs, parsed);
}
