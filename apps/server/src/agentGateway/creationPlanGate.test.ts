import { describe, expect, it } from "vitest";

import {
  isGatewayTurnStateTerminal,
  parseCreatedThreadIds,
  previousCreationPlanBlocksNextWave,
  previousWaveNeedsTerminalThreads,
} from "./creationPlanGate.ts";

describe("creationPlanGate", () => {
  it("treats idle, completed, error, and interrupted as terminal", () => {
    expect(isGatewayTurnStateTerminal("idle")).toBe(true);
    expect(isGatewayTurnStateTerminal("completed")).toBe(true);
    expect(isGatewayTurnStateTerminal("error")).toBe(true);
    expect(isGatewayTurnStateTerminal("interrupted")).toBe(true);
    expect(isGatewayTurnStateTerminal("running")).toBe(false);
    expect(isGatewayTurnStateTerminal(null)).toBe(false);
  });

  it("reads created thread ids from a completed result payload", () => {
    expect(parseCreatedThreadIds('{"threadIds":["a","b"]}')).toEqual(["a", "b"]);
    expect(parseCreatedThreadIds(null)).toEqual([]);
    expect(parseCreatedThreadIds("{")).toEqual([]);
  });

  it("blocks the next wave until the previous plan completed with every thread id", () => {
    expect(previousCreationPlanBlocksNextWave("dispatching")).toBe(true);
    expect(previousCreationPlanBlocksNextWave("completed")).toBe(false);
    expect(
      previousWaveNeedsTerminalThreads({
        requestedCount: 2,
        resultJson: '{"threadIds":["only-one"]}',
      }),
    ).toBe(true);
    expect(
      previousWaveNeedsTerminalThreads({
        requestedCount: 1,
        resultJson: '{"threadIds":["child"]}',
      }),
    ).toBe(false);
  });
});
