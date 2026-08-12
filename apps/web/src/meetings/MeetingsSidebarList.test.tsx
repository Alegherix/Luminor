import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createIdleMeetingsWorkspace } from "./meetingsWorkspace";
import { MeetingsSidebarList } from "./MeetingsSidebarList";

describe("MeetingsSidebarList", () => {
  it("renders empty today, live, and ended section chrome", () => {
    const html = renderToStaticMarkup(
      <MeetingsSidebarList workspace={createIdleMeetingsWorkspace()} />,
    );

    expect(html).toContain("Live");
    expect(html).toContain("Today");
    expect(html).toContain("Ended");
    expect(html).toContain("No live meeting");
    expect(html).toContain("No other meetings today");
    expect(html).toContain("No ended meetings today");
  });
});
