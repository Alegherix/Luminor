import { describe, expect, it } from "vitest";

import { interpolate, middleTruncate } from "./format";

describe("interpolate", () => {
  it("replaces named placeholders", () => {
    expect(interpolate("Edited {count} files", { count: 3 })).toBe("Edited 3 files");
  });

  it("leaves unknown placeholders intact", () => {
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
  });
});

describe("middleTruncate", () => {
  it("keeps short paths", () => {
    expect(middleTruncate("src/a.ts")).toBe("src/a.ts");
  });

  it("truncates long paths in the middle", () => {
    const value = "apps/server/src/orchestration/Layers/OrchestrationEngine.ts";
    const result = middleTruncate(value, 24);
    expect(result.length).toBeLessThan(value.length);
    expect(result.startsWith("apps/serv")).toBe(true);
    expect(result.endsWith("Engine.ts")).toBe(true);
    expect(result.includes("…")).toBe(true);
  });
});
