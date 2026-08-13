import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createIdleMeetingsWorkspace,
  IDLE_MEETINGS_RECORDING,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";
import { MeetingsSidebarList } from "./MeetingsSidebarList";

const NOW = new Date("2026-08-12T12:00:00.000Z");

const signedInWorkspace: MeetingsWorkspaceSnapshot = {
  connection: "signed-in",
  accountEmail: "me@example.com",
  selectedSessionId: "later",
  joinedSessionId: null,
  embedVisible: false,
  joinError: null,
  recording: IDLE_MEETINGS_RECORDING,
  pastedMeetUrl: "",
  dueReminders: [],
  sessions: [
    {
      id: "live",
      title: "Interview",
      startAt: "2026-08-12T11:30:00.000Z",
      endAt: "2026-08-12T12:30:00.000Z",
      meetUrl: "https://meet.google.com/live",
      attendees: [],
      status: "live",
      source: "calendar",
    },
    {
      id: "later",
      title: "Retro",
      startAt: "2026-08-12T15:00:00.000Z",
      endAt: "2026-08-12T15:45:00.000Z",
      meetUrl: null,
      attendees: [],
      status: "upcoming",
      source: "calendar",
    },
    {
      id: "ended",
      title: "Standup",
      startAt: "2026-08-12T09:00:00.000Z",
      endAt: "2026-08-12T09:30:00.000Z",
      meetUrl: null,
      attendees: [],
      status: "ended",
      source: "calendar",
    },
  ],
};

describe("MeetingsSidebarList", () => {
  it("renders empty today, live, and ended section chrome when signed in with no events", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList
        workspace={{ ...createIdleMeetingsWorkspace(), connection: "signed-in" }}
      />,
    );

    expect(html).toContain("Live");
    expect(html).toContain("Today");
    expect(html).toContain("Ended");
    expect(html).toContain("No live meeting");
    expect(html).toContain("No other meetings today");
    expect(html).toContain("No ended meetings today");
  });

  it("explains how to connect Google Calendar when signed out", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList workspace={createIdleMeetingsWorkspace()} />,
    );

    expect(html).toContain("Connect Google Calendar");
    expect(html).toContain("installed OAuth client");
    expect(html).toContain("primary calendar");
    expect(html).not.toContain("No live meeting");
  });

  it("lists today's meetings and marks the selected row", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList workspace={signedInWorkspace} now={NOW} />,
    );

    expect(html).toContain("Interview");
    expect(html).toContain("Retro");
    expect(html).toContain("Standup");
    expect(html).toContain('aria-pressed="true"');
  });

  it("renders selectable meeting rows", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList workspace={signedInWorkspace} now={NOW} />,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain("Interview");
    expect(html).toContain("Retro");
  });

  it("lists a pasted Meet join even when Calendar is signed out", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList
        now={NOW}
        workspace={{
          ...createIdleMeetingsWorkspace(),
          selectedSessionId: "pasted:abc-defg-hij",
          joinedSessionId: "pasted:abc-defg-hij",
          sessions: [
            {
              id: "pasted:abc-defg-hij",
              title: "Meet abc-defg-hij",
              startAt: "2026-08-12T12:00:00.000Z",
              endAt: null,
              meetUrl: "https://meet.google.com/abc-defg-hij",
              attendees: [],
              status: "live",
              source: "pasted",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Meet abc-defg-hij");
    expect(html).not.toContain("Connect Google Calendar");
  });

  it("lists a pasted Meet join in today's sidebar", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList
        now={NOW}
        workspace={{
          ...signedInWorkspace,
          selectedSessionId: "pasted:abc-defg-hij",
          joinedSessionId: "pasted:abc-defg-hij",
          sessions: [
            ...signedInWorkspace.sessions,
            {
              id: "pasted:abc-defg-hij",
              title: "Meet abc-defg-hij",
              startAt: "2026-08-12T12:00:00.000Z",
              endAt: null,
              meetUrl: "https://meet.google.com/abc-defg-hij",
              attendees: [],
              status: "live",
              source: "pasted",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Meet abc-defg-hij");
  });

  it("offers Join on a live Meet row even when the reminder toast was never seen", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList workspace={signedInWorkspace} now={NOW} />,
    );

    expect(html).toMatch(/Interview[\s\S]*Join/);
    expect(html).not.toMatch(/Retro[\s\S]*Join[\s\S]*Standup/);
  });

  it("hides Join on the live row after that meeting is already joined", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList
        now={NOW}
        workspace={{ ...signedInWorkspace, joinedSessionId: "live" }}
      />,
    );

    expect(html).toContain("Interview");
    expect(html).not.toMatch(/Interview[\s\S]*Join/);
  });
});
