import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./formatRelativeTime";

const NOW = Date.parse("2026-08-16T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("returns just now for timestamps under a minute", () => {
    expect(formatRelativeTime("2026-08-16T11:59:30.000Z", NOW)).toBe("just now");
  });

  it("uses minute, hour, and day buckets with an ago suffix", () => {
    expect(formatRelativeTime("2026-08-16T11:58:00.000Z", NOW)).toBe("2m ago");
    expect(formatRelativeTime("2026-08-16T09:00:00.000Z", NOW)).toBe("3h ago");
    expect(formatRelativeTime("2026-08-14T12:00:00.000Z", NOW)).toBe("2d ago");
  });

  it("uses week, month, and year buckets", () => {
    expect(formatRelativeTime("2026-08-02T12:00:00.000Z", NOW)).toBe("2w ago");
    expect(formatRelativeTime("2026-05-16T12:00:00.000Z", NOW)).toBe("3mo ago");
    expect(formatRelativeTime("2024-08-16T12:00:00.000Z", NOW)).toBe("2y ago");
  });

  it("returns an empty string for invalid timestamps", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
  });
});
