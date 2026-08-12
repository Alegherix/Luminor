import { describe, expect, it } from "vitest";

import { extractMeetCode, normalizePastedMeetUrl, pastedMeetingSessionId } from "./meetUrl";

describe("normalizePastedMeetUrl", () => {
  it("accepts a canonical Meet URL and strips query or hash", () => {
    expect(normalizePastedMeetUrl("https://meet.google.com/abc-defg-hij?authuser=0#room")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("accepts a host-only paste", () => {
    expect(normalizePastedMeetUrl("meet.google.com/abc-defg-hij")).toBe(
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("rejects non-Meet and malformed pastes", () => {
    expect(normalizePastedMeetUrl("https://zoom.us/j/123")).toBeNull();
    expect(normalizePastedMeetUrl("http://meet.google.com/abc-defg-hij")).toBeNull();
    expect(normalizePastedMeetUrl("https://meet.google.com/not-a-code")).toBeNull();
    expect(normalizePastedMeetUrl("not a url")).toBeNull();
    expect(normalizePastedMeetUrl("")).toBeNull();
  });
});

describe("extractMeetCode", () => {
  it("reads the xxx-yyyy-zzz code", () => {
    expect(extractMeetCode("https://meet.google.com/abc-defg-hij")).toBe("abc-defg-hij");
    expect(pastedMeetingSessionId("https://meet.google.com/abc-defg-hij")).toBe(
      "pasted:abc-defg-hij",
    );
  });
});
