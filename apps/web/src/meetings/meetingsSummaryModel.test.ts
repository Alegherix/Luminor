import { getDefaultModel } from "@luminor/shared/model";
import { describe, expect, it } from "vitest";

import {
  isDedicatedTextGenerationSelection,
  resolveNewThreadDefaultModelSelection,
} from "./meetingsSummaryModel";

describe("resolveNewThreadDefaultModelSelection", () => {
  it("uses the project default model instead of a hardcoded slug", () => {
    expect(
      resolveNewThreadDefaultModelSelection({
        projectDefaultModelSelection: {
          provider: "grok",
          model: "grok-4",
        },
        defaultProvider: "codex",
      }),
    ).toEqual({
      provider: "grok",
      model: "grok-4",
    });
  });

  it("falls back to the app default provider's default model", () => {
    expect(
      resolveNewThreadDefaultModelSelection({
        projectDefaultModelSelection: null,
        defaultProvider: "claudeAgent",
      }),
    ).toEqual({
      provider: "claudeAgent",
      model: getDefaultModel("claudeAgent"),
    });
  });
});

describe("isDedicatedTextGenerationSelection", () => {
  it("accepts Codex and rejects Grok or Claude Agent", () => {
    expect(isDedicatedTextGenerationSelection({ provider: "codex", model: "gpt-5.4" })).toBe(true);
    expect(isDedicatedTextGenerationSelection({ provider: "grok", model: "grok-4" })).toBe(false);
    expect(
      isDedicatedTextGenerationSelection({ provider: "claudeAgent", model: "claude-sonnet-4-6" }),
    ).toBe(false);
  });
});
