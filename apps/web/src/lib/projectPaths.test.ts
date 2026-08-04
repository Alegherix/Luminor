import { describe, expect, it } from "vitest";

import { joinProjectPath } from "./projectPaths";

describe("joinProjectPath", () => {
  it.each([
    ["/Users/test/Developer/", "codex", "/Users/test/Developer/codex"],
    ["/", "codex", "/codex"],
    ["C:\\Users\\test\\", "codex", "C:\\Users\\test\\codex"],
    ["C:\\", "codex", "C:\\codex"],
  ])("joins %s and %s", (parent, child, expected) => {
    expect(joinProjectPath(parent, child)).toBe(expected);
  });
});
