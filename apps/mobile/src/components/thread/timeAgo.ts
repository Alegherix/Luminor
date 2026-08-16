import { strings } from "../../strings";
import { interpolate } from "./format";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function parseIsoMs(iso: string): number | null {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

export function formatTimeAgo(iso: string, nowMs = Date.now()): string {
  const then = parseIsoMs(iso);
  if (then === null) return iso;
  const elapsed = Math.max(0, nowMs - then);
  if (elapsed < MINUTE_MS) return strings.thread.justNow;
  if (elapsed < HOUR_MS) {
    return interpolate(strings.thread.minutesAgo, { count: Math.floor(elapsed / MINUTE_MS) });
  }
  if (elapsed < DAY_MS) {
    return interpolate(strings.thread.hoursAgo, { count: Math.floor(elapsed / HOUR_MS) });
  }
  return interpolate(strings.thread.daysAgo, { count: Math.floor(elapsed / DAY_MS) });
}

export function formatMinutesShort(iso: string, nowMs = Date.now()): string {
  const then = parseIsoMs(iso);
  if (then === null) return interpolate(strings.thread.minutesShort, { count: 0 });
  const minutes = Math.max(0, Math.floor((nowMs - then) / MINUTE_MS));
  return interpolate(strings.thread.minutesShort, { count: minutes });
}

export function formatClockTime(iso: string): string {
  const then = parseIsoMs(iso);
  if (then === null) return "";
  const date = new Date(then);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
