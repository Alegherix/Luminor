import { describe, expect, it } from "vitest";

import {
  extractMeetCode,
  normalizePastedMeetUrl,
  pastedMeetingSessionId,
  pastedMeetingTitle,
  resolveMeetingJoinTarget,
} from "./meetUrl";

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

describe("resolveMeetingJoinTarget", () => {
  it("sends normalized Meet URLs to the embed", () => {
    expect(
      resolveMeetingJoinTarget("https://meet.google.com/abc-defg-hij?authuser=0", "pasted"),
    ).toEqual({
      kind: "embed",
      url: "https://meet.google.com/abc-defg-hij",
    });
    expect(resolveMeetingJoinTarget("https://meet.google.com/live", "session")).toEqual({
      kind: "embed",
      url: "https://meet.google.com/live",
    });
  });

  it("sends other http(s) meeting links to the system browser", () => {
    expect(resolveMeetingJoinTarget("https://zoom.us/j/123", "pasted")).toEqual({
      kind: "external",
      url: "https://zoom.us/j/123",
    });
    expect(
      resolveMeetingJoinTarget("http://teams.microsoft.com/l/meetup-join/abc", "session"),
    ).toEqual({
      kind: "external",
      url: "http://teams.microsoft.com/l/meetup-join/abc",
    });
  });

  it("rejects non-http(s) and malformed pastes", () => {
    expect(resolveMeetingJoinTarget("not a url", "pasted")).toBeNull();
    expect(resolveMeetingJoinTarget("javascript:alert(1)", "pasted")).toBeNull();
    expect(resolveMeetingJoinTarget("ftp://zoom.us/j/123", "session")).toBeNull();
    expect(resolveMeetingJoinTarget("", "pasted")).toBeNull();
  });
});

describe("pasted external meeting identity", () => {
  it("uses the normalized URL as the pasted session id and the host as the title", () => {
    expect(pastedMeetingSessionId("https://zoom.us/j/123")).toBe("pasted:https://zoom.us/j/123");
    expect(pastedMeetingTitle("https://zoom.us/j/123")).toBe("zoom.us");
  });
});
