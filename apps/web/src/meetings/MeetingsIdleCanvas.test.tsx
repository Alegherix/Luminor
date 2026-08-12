import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeetingsIdleCanvas } from "./MeetingsIdleCanvas";

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
});
