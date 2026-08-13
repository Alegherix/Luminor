import { getDefaultModel } from "@luminor/shared/model";
import { describe, expect, it } from "vitest";

import { resolveNewThreadDefaultModelSelection } from "./meetingsSummaryModel";

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
