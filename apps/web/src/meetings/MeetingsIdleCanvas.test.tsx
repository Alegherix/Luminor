import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeetingsIdleCanvas } from "./MeetingsIdleCanvas";
import { createIdleMeetingsWorkspace } from "./meetingsWorkspace";

describe("MeetingsIdleCanvas", () => {
  it("matches the interview-picker information architecture without Open planner", () => {
    const html = renderToStaticMarkup(<MeetingsIdleCanvas />);

    expect(html).toContain("Google Meet opens here");
    expect(html).toContain("Google Meet link");
    expect(html).toContain("https://meet.google.com/abc-defg-hij");
    expect(html).toContain("Selected meeting");
    expect(html).toContain("Select a meeting to get started");
    expect(html).toContain("Join");
    expect(html).not.toContain("Open planner");
  });

  it("fills the selected-meeting card from the workspace selection", () => {
    const html = renderToStaticMarkup(
      <MeetingsIdleCanvas
        workspace={{
          ...createIdleMeetingsWorkspace(),
          connection: "signed-in",
          selectedSessionId: "later",
          sessions: [
            {
              id: "later",
              title: "Retro",
              startAt: "2026-08-12T15:00:00.000Z",
              endAt: "2026-08-12T15:45:00.000Z",
              meetUrl: "https://meet.google.com/retro",
              attendees: [],
              status: "upcoming",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Retro");
    expect(html).not.toContain("Select a meeting to get started");
  });
});
