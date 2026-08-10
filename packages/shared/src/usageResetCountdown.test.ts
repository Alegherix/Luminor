import { describe, expect, it } from "vitest";

import {
  formatUsageResetDuration,
  getResetCountdownNextTickDelay,
  getResetCountdownNextTickDelayForIso,
} from "./usageResetCountdown";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

describe("formatUsageResetDuration", () => {
  it("formats minutes, hours, and days", () => {
    expect(formatUsageResetDuration(47 * MINUTE_MS)).toBe("47m");
    expect(formatUsageResetDuration(3 * HOUR_MS + 54 * MINUTE_MS)).toBe("3h 54m");
    expect(formatUsageResetDuration(6 * DAY_MS + 7 * HOUR_MS + 30 * MINUTE_MS)).toBe("6d 7h");
  });

  it("returns null for elapsed or sub-minute windows", () => {
    expect(formatUsageResetDuration(0)).toBeNull();
    expect(formatUsageResetDuration(-5_000)).toBeNull();
    expect(formatUsageResetDuration(30_000)).toBeNull();
    expect(formatUsageResetDuration(Number.NaN)).toBeNull();
  });
});

describe("getResetCountdownNextTickDelay", () => {
  it("ticks on the next minute boundary for sub-day windows", () => {
    const now = 1_000_000;
    const delay = getResetCountdownNextTickDelay(now, [now + 3 * HOUR_MS + 90_500]);
    expect(delay).toBe(30_501);
  });

  it("ticks on the next hour boundary once a day or more remains", () => {
    const now = 1_000_000;
    const delay = getResetCountdownNextTickDelay(now, [now + 2 * DAY_MS + 5 * MINUTE_MS]);
    expect(delay).toBe(5 * MINUTE_MS + 1);
  });

  it("uses the soonest tick across windows and skips elapsed ones", () => {
    const now = 1_000_000;
    const delay = getResetCountdownNextTickDelay(now, [
      now - HOUR_MS,
      now + 2 * DAY_MS + 30 * MINUTE_MS,
      now + 10 * MINUTE_MS + 5_000,
    ]);
    expect(delay).toBe(5_001);
  });

  it("falls back to a minute tick when nothing is pending", () => {
    expect(getResetCountdownNextTickDelay(1_000, [])).toBe(MINUTE_MS);
    expect(getResetCountdownNextTickDelay(1_000, [Number.NaN, 500])).toBe(MINUTE_MS);
  });
});

describe("getResetCountdownNextTickDelayForIso", () => {
  it("parses ISO resets and ignores unusable values", () => {
    const now = Date.parse("2026-08-10T12:00:00.000Z");
    const delay = getResetCountdownNextTickDelayForIso(now, [
      null,
      undefined,
      "not-a-date",
      "2026-08-10T12:10:30.000Z",
    ]);
    expect(delay).toBe(30_001);
  });
});
