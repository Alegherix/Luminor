// FILE: chatHeaderControls.browser.tsx
// Purpose: Browser regressions for interactive versus static shared surface-tab chips.
// Layer: Chat header controls test

import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { SurfaceTabChip } from "./chatHeaderControls";

describe("SurfaceTabChip selection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a static label when a single-pane host omits selection", async () => {
    await render(
      <SurfaceTabChip
        active
        icon={<span aria-hidden>PR</span>}
        label="PR #42"
        closeLabel="Close PR #42"
        onClose={vi.fn()}
      />,
    );

    expect(document.querySelectorAll("button")).toHaveLength(1);
    expect(page.getByRole("button", { name: "Close PR #42" })).toBeVisible();
    expect(document.body.textContent).toContain("PR #42");
    expect(document.body.textContent).toContain("PR");
    expect(document.querySelector("[aria-pressed]")).toBeNull();
  });

  it("keeps the panel icon and puts close to the right of the label", async () => {
    const onClose = vi.fn();
    await render(
      <SurfaceTabChip
        active
        icon={<span data-testid="pane-icon">Browser</span>}
        label="Browser"
        closeLabel="Close Browser"
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    const icon = document.querySelector("[data-testid='pane-icon']");
    const closeButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Close Browser"]',
    );
    const selectButton = document.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(icon).not.toBeNull();
    expect(closeButton).not.toBeNull();
    expect(selectButton).not.toBeNull();
    expect(
      Boolean(
        icon &&
          closeButton &&
          selectButton &&
          (icon.compareDocumentPosition(selectButton) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
          (selectButton.compareDocumentPosition(closeButton) & Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
      ),
    ).toBe(true);

    closeButton?.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the selectable button for multi-pane hosts", async () => {
    const onSelect = vi.fn();
    await render(
      <SurfaceTabChip
        active
        icon={<span aria-hidden>PR</span>}
        label="PR #42"
        onSelect={onSelect}
      />,
    );

    const selectButton = document.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(selectButton).not.toBeNull();
    selectButton?.click();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
