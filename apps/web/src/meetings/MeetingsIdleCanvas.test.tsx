import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeetingsIdleCanvas } from "./MeetingsIdleCanvas";
import { createIdleMeetingsWorkspace } from "./meetingsWorkspace";

const NOW = new Date("2026-08-13T07:56:00.000Z");

describe("MeetingsIdleCanvas", () => {
  it("keeps a paste-a-link path when there is no meeting to join", () => {
    const html = renderToStaticMarkup(<MeetingsIdleCanvas now={NOW} />);

    expect(html).toContain("No meeting to join yet");
    expect(html).toContain("Google Meet link");
    expect(html).toContain("https://meet.google.com/abc-defg-hij");
    expect(html).toContain("Join");
    expect(html).not.toContain("Open planner");
  });

  it("turns the next meeting into a join panel with countdown and time range", () => {
    const html = renderToStaticMarkup(
      <MeetingsIdleCanvas
        now={NOW}
        workspace={{
          ...createIdleMeetingsWorkspace(),
          connection: "signed-in",
          selectedSessionId: "standup",
          sessions: [
            {
              id: "standup",
              title: "Standup – standardiza",
              startAt: "2026-08-13T08:00:00.000Z",
              endAt: "2026-08-13T08:30:00.000Z",
              meetUrl: "https://meet.google.com/abc-defg-hij",
              attendees: ["Ada Lovelace", "alan@example.com", "Grace", "Linus"],
              status: "upcoming",
              source: "calendar",
            },
            {
              id: "later",
              title: "Production Plans",
              startAt: "2026-08-13T09:00:00.000Z",
              endAt: "2026-08-13T10:00:00.000Z",
              meetUrl: null,
              attendees: [],
              status: "upcoming",
              source: "calendar",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Standup – standardiza");
    expect(html).toContain("Starts in 4 min");
    expect(html).toContain("Join now");
    expect(html).toContain("Today’s schedule");
    expect(html).toContain("Production Plans");
    expect(html).toContain("meet.google.com/abc-defg-hij");
    expect(html).toContain("–");
    expect(html).toContain("Show 1 more attendee");
    expect(html).toContain("+1");
    expect(html).not.toContain("Select a meeting to get started");
    expect(html).not.toContain("Open planner");
  });

  it("shows a clear error when a pasted Meet link is rejected", () => {
    const html = renderToStaticMarkup(
      <MeetingsIdleCanvas
        now={NOW}
        workspace={{
          ...createIdleMeetingsWorkspace(),
          joinError: "That is not a meeting link.",
        }}
      />,
    );

    expect(html).toContain("That is not a meeting link.");
    expect(html).toContain('role="alert"');
  });
});
