import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SidebarSurfacePicker } from "./Sidebar";

describe("SidebarSurfacePicker", () => {
  it("shows a presence dot on Möten while a meeting is joined", () => {
    const joined = renderToStaticMarkup(
      <SidebarSurfacePicker
        views={["threads", "meetings"]}
        activeView="threads"
        meetingsJoined
        onSelectView={() => undefined}
      />,
    );
    const idle = renderToStaticMarkup(
      <SidebarSurfacePicker
        views={["threads", "meetings"]}
        activeView="threads"
        onSelectView={() => undefined}
      />,
    );

    expect(joined).toContain("In a meeting");
    expect(idle).not.toContain("In a meeting");
  });
});
