import { homedir } from "node:os";
import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodeGrokSessionCwdSegment,
  grokContextOccupancyKey,
  grokSessionSignalsPathCandidates,
  parseGrokContextOccupancy,
} from "./grokContextUsage.ts";

describe("parseGrokContextOccupancy", () => {
  it("reads live signals.json occupancy", () => {
    expect(
      parseGrokContextOccupancy({
        contextWindowUsage: 21,
        contextTokensUsed: 107_309,
        contextWindowTokens: 500_000,
      }),
    ).toEqual({
      usedTokens: 107_309,
      usedPercent: 21,
      maxTokens: 500_000,
      compactsAutomatically: true,
    });
  });

  it("reads nested session/usage occupancy", () => {
    expect(
      parseGrokContextOccupancy({
        usage: {
          tokens_used: 12_000,
          context_window: 256_000,
          context_usage_pct: 4.7,
        },
      }),
    ).toEqual({
      usedTokens: 12_000,
      usedPercent: 4.7,
      maxTokens: 256_000,
      compactsAutomatically: true,
    });
  });

  it("computes percent from used/max when Grok omits the percent", () => {
    expect(
      parseGrokContextOccupancy({
        tokensUsed: 50_000,
        contextWindowTokens: 500_000,
      }),
    ).toEqual({
      usedTokens: 50_000,
      usedPercent: 10,
      maxTokens: 500_000,
      compactsAutomatically: true,
    });
  });

  it("rejects empty or spend-only payloads that have no occupancy", () => {
    expect(parseGrokContextOccupancy({})).toBeUndefined();
    expect(
      parseGrokContextOccupancy({
        contextWindowTokens: 500_000,
        contextTokensUsed: 0,
        contextWindowUsage: 0,
      }),
    ).toBeUndefined();
    expect(parseGrokContextOccupancy({ inputTokens: 80_000, outputTokens: 1_200 })).toBeUndefined();
  });
});

describe("grok session signals path", () => {
  it("encodes the cwd the same way Grok stores sessions", () => {
    const cwd =
      "/home/alegherix/Development/PersonalProjects/Luminor/.luminor/electron-dev/worktrees/8301/luminor";
    expect(encodeGrokSessionCwdSegment(cwd)).toBe(
      "%2Fhome%2Falegherix%2FDevelopment%2FPersonalProjects%2FLuminor%2F.luminor%2Felectron-dev%2Fworktrees%2F8301%2Fluminor",
    );
    expect(
      grokSessionSignalsPathCandidates({
        cwd,
        sessionId: "019ffa4b-61b5-7863-abc0-697e986a157a",
      }),
    ).toContain(
      nodePath.join(
        homedir(),
        ".grok",
        "sessions",
        encodeGrokSessionCwdSegment(cwd),
        "019ffa4b-61b5-7863-abc0-697e986a157a",
        "signals.json",
      ),
    );
  });

  it("prefers GROK_HOME when set", () => {
    const paths = grokSessionSignalsPathCandidates({
      env: { GROK_HOME: "/tmp/custom-grok" },
      cwd: "/repo",
      sessionId: "session-1",
    });
    expect(paths[0]).toBe(
      nodePath.join("/tmp/custom-grok", "sessions", "%2Frepo", "session-1", "signals.json"),
    );
  });
});

describe("grokContextOccupancyKey", () => {
  it("changes when occupancy changes", () => {
    const first = parseGrokContextOccupancy({
      contextTokensUsed: 10,
      contextWindowTokens: 100,
    })!;
    const second = parseGrokContextOccupancy({
      contextTokensUsed: 20,
      contextWindowTokens: 100,
    })!;
    expect(grokContextOccupancyKey(first)).not.toBe(grokContextOccupancyKey(second));
  });
});
