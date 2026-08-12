import { describe, expect, it } from "vitest";

import { meetingReminderToastCopy } from "./MeetingReminderNotifications";

describe("meetingReminderToastCopy", () => {
  it("labels starting and join-available reminders without OS notification actions", () => {
    expect(
      meetingReminderToastCopy({
        kind: "meeting.starting",
        sessionId: "standup",
        title: "Standup",
        meetUrl: "https://meet.google.com/abc-defg-hij",
      }),
    ).toEqual({ title: "Starting soon: Standup" });
    expect(
      meetingReminderToastCopy({
        kind: "meeting.join_available",
        sessionId: "standup",
        title: "Standup",
        meetUrl: "https://meet.google.com/abc-defg-hij",
      }),
    ).toEqual({
      title: "Join available: Standup",
      description: "https://meet.google.com/abc-defg-hij",
    });
  });
});
