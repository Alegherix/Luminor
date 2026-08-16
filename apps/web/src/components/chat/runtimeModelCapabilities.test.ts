import type { ProviderModelDescriptor } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import {
  getRuntimeAwareModelCapabilities,
  resolveRuntimeModelDescriptor,
} from "./runtimeModelCapabilities";

describe("resolveRuntimeModelDescriptor", () => {
  it("matches a Claude model by its resolved canonical id", () => {
    const runtimeModels: ReadonlyArray<ProviderModelDescriptor> = [
      {
        slug: "sonnet",
        resolvedModel: "claude-sonnet-5",
        name: "Claude Sonnet 5",
        supportsAutoMode: false,
      },
    ];

    expect(
      resolveRuntimeModelDescriptor({
        provider: "claudeAgent",
        model: "claude-sonnet-5",
        runtimeModels,
      }),
    ).toBe(runtimeModels[0]);
  });
});

describe("getRuntimeAwareModelCapabilities", () => {
  it("prefers a runtime-discovered context window over the static catalog", () => {
    expect(
      getRuntimeAwareModelCapabilities({
        provider: "pi",
        model: "anthropic/claude-opus-4-8",
        runtimeModel: {
          slug: "anthropic/claude-opus-4-8",
          name: "Claude Opus 4.8",
          contextWindowTokens: 200_000,
        },
      }).contextWindowTokens,
    ).toBe(200_000);
  });
});
