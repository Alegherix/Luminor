import { describe, expect, it } from "vitest";

import { normalizeProjectScriptRoles } from "./projectScripts";

const script = (id: string, kind: "manual" | "setup" | "preview") => ({
  id,
  name: id,
  command: `bun run ${id}`,
  icon: "play" as const,
  kind,
});

describe("normalizeProjectScriptRoles", () => {
  it.each(["setup", "preview"] as const)(
    "demotes the previous %s holder when another script is promoted",
    (kind) => {
      const scripts = [script(`old-${kind}`, kind), script(`new-${kind}`, kind)];

      expect(normalizeProjectScriptRoles(scripts, `new-${kind}`)).toEqual([
        script(`old-${kind}`, "manual"),
        script(`new-${kind}`, kind),
      ]);
    },
  );

  it("retains the first holder of each singleton role for an ambiguous save", () => {
    const scripts = [
      script("setup-a", "setup"),
      script("setup-b", "setup"),
      script("preview-a", "preview"),
      script("preview-b", "preview"),
    ];

    expect(normalizeProjectScriptRoles(scripts).map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "setup-a", kind: "setup" },
      { id: "setup-b", kind: "manual" },
      { id: "preview-a", kind: "preview" },
      { id: "preview-b", kind: "manual" },
    ]);
  });
});
