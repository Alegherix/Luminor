// FILE: fontFamily.test.ts
// Purpose: Verifies CSS-safe font-family normalization for user and theme settings.
// Layer: Web appearance utility tests
// Exports: Vitest coverage for fontFamily helpers.

import * as FS from "node:fs";
import * as Path from "node:path";

import { describe, expect, it } from "vitest";
import {
  BUNDLED_UI_FONT_FAMILIES,
  DEFAULT_MONOSPACE_FONT_FAMILY_STACK,
  normalizeFontFamilyCssValue,
  normalizeMonospaceFontFamilyCssValue,
} from "./fontFamily";

const INDEX_SOURCE = FS.readFileSync(Path.resolve(import.meta.dirname, "../../index.html"), "utf8");

describe("normalizeFontFamilyCssValue", () => {
  it("quotes multi-word family names inside a stack", () => {
    expect(normalizeFontFamilyCssValue("Fira Code, Menlo")).toBe('"Fira Code", Menlo');
  });

  it("maps the MissionDeck ui token to the CSS system-ui generic", () => {
    expect(normalizeFontFamilyCssValue("Goldman, Michroma, ui")).toBe(
      "Goldman, Michroma, system-ui",
    );
  });
});

describe("bundled UI fonts", () => {
  it("loads Aldrich, Goldman, and Michroma from the Google Fonts stylesheet", () => {
    expect(INDEX_SOURCE).toContain("family=Aldrich");
    expect(INDEX_SOURCE).toContain("family=Goldman");
    expect(INDEX_SOURCE).toContain("family=Michroma");
    expect(BUNDLED_UI_FONT_FAMILIES).toEqual(
      expect.arrayContaining(["Aldrich", "Goldman", "Michroma"]),
    );
  });
});

describe("normalizeMonospaceFontFamilyCssValue", () => {
  it("appends the default mono stack when a code font has no fallback", () => {
    expect(normalizeMonospaceFontFamilyCssValue("Jetbrains Mono")).toBe(
      `"Jetbrains Mono", ${DEFAULT_MONOSPACE_FONT_FAMILY_STACK}`,
    );
  });

  it("keeps existing generic mono fallbacks intact", () => {
    expect(normalizeMonospaceFontFamilyCssValue('"Geist Mono", ui-monospace')).toBe(
      '"Geist Mono", ui-monospace',
    );
  });

  it("preserves CSS-wide keywords as single values", () => {
    expect(normalizeMonospaceFontFamilyCssValue("inherit")).toBe("inherit");
  });
});
