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

  it("keeps Leave for an external join without a meeting webview host", () => {
    const html = renderToStaticMarkup(
      <MeetingsEmbedCanvas presentation="external" onLeave={() => undefined} />,
    );

    expect(html).toContain("This meeting is open in your browser");
    expect(html).toContain("Leave");
    expect(html).not.toContain("meeting-webview-host");
    expect(html).not.toContain("Google Meet is open in this window");
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
