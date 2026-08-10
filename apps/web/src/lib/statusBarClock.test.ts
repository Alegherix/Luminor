import { describe, expect, it } from "vitest";

import { formatStatusBarDateTime } from "./statusBarClock";

describe("formatStatusBarDateTime", () => {
  it("formats local date and time as YYYY-MM-DD HH:mm", () => {
    const date = new Date(2026, 7, 8, 22, 56, 30);
    expect(formatStatusBarDateTime(date)).toBe("2026-08-08 22:56");
  });

  it("zero-pads single-digit month, day, hour, and minute", () => {
    const date = new Date(2026, 0, 5, 3, 7, 0);
    expect(formatStatusBarDateTime(date)).toBe("2026-01-05 03:07");
  });
});
