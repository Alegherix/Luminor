import { describe, expect, it } from "vitest";

import { parseResourceProcessTable } from "./resourceProcessMonitor";

describe("parseResourceProcessTable", () => {
  it("parses ps rows", () => {
    const rows = parseResourceProcessTable(
      [
        "  1418  1147 3082684  0.2 38167 iii /home/a/.local/bin/iii --config foo",
        "  1524  1505 2259124  0.0 38167 webpack webpack",
        "not a row",
      ].join("\n"),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.pid).toBe(1418);
    expect(rows[0]?.comm).toBe("iii");
    expect(rows[1]?.comm).toBe("webpack");
    expect(rows[1]?.rssKb).toBe(2259124);
  });
});
