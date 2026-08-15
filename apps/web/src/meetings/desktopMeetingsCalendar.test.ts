import { afterEach, describe, expect, it, vi } from "vitest";

import { createDesktopMeetingsCalendarHost } from "./desktopMeetingsCalendar";

describe("createDesktopMeetingsCalendarHost", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { desktopBridge?: unknown }).desktopBridge;
  });

  it("stays signed out when the desktop meetings bridge is missing", async () => {
    const host = createDesktopMeetingsCalendarHost();

    await expect(host.getStatus()).resolves.toEqual({ connected: false, accountEmail: null });
    await expect(host.connect()).resolves.toEqual({ connected: false, accountEmail: null });
    await expect(host.listToday()).resolves.toEqual([]);
    await expect(host.listHistory()).resolves.toEqual([]);
  });

  it("delegates to the desktop meetings bridge", async () => {
    const meetings = {
      getStatus: vi.fn(async () => ({ connected: true, accountEmail: "me@example.com" })),
      connect: vi.fn(async () => ({ connected: true, accountEmail: "me@example.com" })),
      listToday: vi.fn(async () => [
        {
          id: "evt-1",
          title: "Interview",
          startAt: "2026-08-12T11:30:00.000Z",
          endAt: "2026-08-12T12:30:00.000Z",
          meetUrl: "https://meet.google.com/live",
          attendees: [],
        },
      ]),
      listHistory: vi.fn(async () => [
        {
          id: "hist-1",
          title: "Standup - standardize",
          startAt: "2026-08-12T06:00:00.000Z",
          endAt: "2026-08-12T06:25:00.000Z",
          meetUrl: "https://meet.google.com/ikn-octf-haj",
          attendees: [],
        },
      ]),
    };
    (globalThis as typeof globalThis & { desktopBridge?: unknown }).desktopBridge = { meetings };
    const host = createDesktopMeetingsCalendarHost();

    await expect(host.getStatus()).resolves.toEqual({
      connected: true,
      accountEmail: "me@example.com",
    });
    await expect(host.connect()).resolves.toEqual({
      connected: true,
      accountEmail: "me@example.com",
    });
    await expect(host.listToday()).resolves.toHaveLength(1);
    await expect(host.listHistory()).resolves.toHaveLength(1);
    expect(meetings.connect).toHaveBeenCalledTimes(1);
  });
});
