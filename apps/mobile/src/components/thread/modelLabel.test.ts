import { describe, expect, it } from "vitest";

import { formatContextWindow, formatModelSelectionLabel, providerLabel } from "./modelLabel";

describe("formatContextWindow", () => {
  it("compacts token counts", () => {
    expect(formatContextWindow("500000")).toBe("500k");
    expect(formatContextWindow("1_000_000")).toBe("1m");
    expect(formatContextWindow("200k")).toBe("200k");
  });
});

describe("formatModelSelectionLabel", () => {
  it("humanizes a stored slug", () => {
    expect(formatModelSelectionLabel({ provider: "grok", model: "grok-4.5" })).toBe("Grok 4.5");
  });

  it("prefers the catalog name and context window", () => {
    expect(
      formatModelSelectionLabel(
        { provider: "grok", model: "grok-4.6" },
        {
          slug: "grok-4.6",
          name: "Grok 4.6",
          defaultContextWindow: "500000",
        },
      ),
    ).toBe("Grok 4.6 (500k)");
  });
});

describe("providerLabel", () => {
  it("maps known providers", () => {
    expect(providerLabel("claudeAgent")).toBe("Claude");
    expect(providerLabel("codex")).toBe("Codex");
  });
});
