import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DISCLOSURE_SHELL_CLOSED_CLASS, DISCLOSURE_SHELL_OPEN_CLASS } from "~/lib/disclosureMotion";
import { DisclosureRegion, PresenceDisclosure } from "./DisclosureRegion";

describe("DisclosureRegion", () => {
  it("maps open state onto the shared shell", () => {
    const openMarkup = renderToStaticMarkup(
      <DisclosureRegion open>
        <p>Visible</p>
      </DisclosureRegion>,
    );
    const closedMarkup = renderToStaticMarkup(
      <DisclosureRegion open={false}>
        <p>Hidden</p>
      </DisclosureRegion>,
    );

    expect(openMarkup).toContain(DISCLOSURE_SHELL_OPEN_CLASS);
    expect(closedMarkup).toContain(DISCLOSURE_SHELL_CLOSED_CLASS);
    expect(closedMarkup).toContain("inert");
  });
});

describe("PresenceDisclosure", () => {
  it("starts closed without mounting a shell", () => {
    const markup = renderToStaticMarkup(
      <PresenceDisclosure open={false} className="seam">
        <p>Queued follow-up</p>
      </PresenceDisclosure>,
    );

    expect(markup).toBe("");
  });

  it("renders children and the seam class while open", () => {
    const markup = renderToStaticMarkup(
      <PresenceDisclosure open className="seam">
        <p>Queued follow-up</p>
      </PresenceDisclosure>,
    );

    expect(markup).toContain(DISCLOSURE_SHELL_OPEN_CLASS);
    expect(markup).toContain("Queued follow-up");
    expect(markup).toContain("seam");
  });
});
