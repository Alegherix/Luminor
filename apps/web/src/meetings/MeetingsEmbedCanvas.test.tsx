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

  it("shows a visible loopback degradation while the call stays open", () => {
    const html = renderToStaticMarkup(
      <MeetingsEmbedCanvas
        onLeave={() => undefined}
        recordingDegradation="System audio is unavailable. Recording microphone only."
      />,
    );

    expect(html).toContain("System audio is unavailable. Recording microphone only.");
    expect(html).toContain("Leave");
  });
});
