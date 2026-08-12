import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MeetingsEmbedCanvas } from "./MeetingsEmbedCanvas";

describe("MeetingsEmbedCanvas", () => {
  it("exposes Leave as the destroy action over the meeting host", () => {
    const html = renderToStaticMarkup(<MeetingsEmbedCanvas onLeave={() => undefined} />);

    expect(html).toContain("Google Meet");
    expect(html).toContain("Leave");
    expect(html).toContain("meeting-webview-host");
  });
});
