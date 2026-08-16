import { describe, expect, it } from "vitest";

import { formatClockTime, formatMinutesShort, formatTimeAgo } from "./timeAgo";

const NOW = Date.parse("2026-08-16T12:00:00.000Z");

describe("formatTimeAgo", () => {
  it("uses just now under a minute", () => {
    expect(formatTimeAgo("2026-08-16T11:59:30.000Z", NOW)).toBe("just now");
  });

  it("formats minutes, hours, and days", () => {
    expect(formatTimeAgo("2026-08-16T11:49:00.000Z", NOW)).toBe("11m ago");
    expect(formatTimeAgo("2026-08-16T09:00:00.000Z", NOW)).toBe("3h ago");
    expect(formatTimeAgo("2026-08-14T12:00:00.000Z", NOW)).toBe("2d ago");
  });
});

describe("formatMinutesShort", () => {
  it("returns whole minutes for the working banner", () => {
    expect(formatMinutesShort("2026-08-16T11:49:00.000Z", NOW)).toBe("11m");
  });
});

describe("formatClockTime", () => {
  it("returns a zero-padded local clock", () => {
    const iso = "2026-08-16T12:05:00.000Z";
    const date = new Date(iso);
    const expected = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    expect(formatClockTime(iso)).toBe(expected);
  });
});
