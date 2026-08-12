import type { ProjectDiscoveredScriptTarget } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { previewCommandSuggestions } from "./previewCommandSuggestions";

function target(input: {
  relativePath?: string;
  scripts: ReadonlyArray<{ name: string; command: string }>;
}): ProjectDiscoveredScriptTarget {
  const relativePath = input.relativePath ?? "";
  return {
    cwd: relativePath ? `/repo/${relativePath}` : "/repo",
    relativePath,
    packageJsonPath: relativePath ? `/repo/${relativePath}/package.json` : "/repo/package.json",
    scripts: input.scripts,
  };
}

describe("previewCommandSuggestions", () => {
  it("keeps only dev-server-shaped scripts when the repository has any", () => {
    const suggestions = previewCommandSuggestions({
      targets: [
        target({
          scripts: [
            { name: "build", command: "bun run build" },
            { name: "dev", command: "bun run dev" },
            { name: "dev:desktop", command: "bun run dev:desktop" },
            { name: "lint", command: "bun run lint" },
            { name: "start", command: "bun run start" },
          ],
        }),
      ],
    });

    expect(suggestions).toEqual([
      { label: "dev", command: "bun run dev" },
      { label: "dev:desktop", command: "bun run dev:desktop" },
      { label: "start", command: "bun run start" },
    ]);
  });

  it("falls back to every discovered script when nothing looks like a dev server", () => {
    const suggestions = previewCommandSuggestions({
      targets: [
        target({
          scripts: [
            { name: "build", command: "npm run build" },
            { name: "test", command: "npm run test" },
          ],
        }),
      ],
    });

    expect(suggestions.map((suggestion) => suggestion.command)).toEqual([
      "npm run build",
      "npm run test",
    ]);
  });

  it("labels nested packages by their path and drops duplicate commands", () => {
    const suggestions = previewCommandSuggestions({
      targets: [
        target({ scripts: [{ name: "dev", command: "bun run dev" }] }),
        target({ relativePath: "apps/web", scripts: [{ name: "dev", command: "bun run dev" }] }),
        target({
          relativePath: "apps/server",
          scripts: [{ name: "dev", command: "pnpm run dev" }],
        }),
      ],
    });

    expect(suggestions).toEqual([
      { label: "dev", command: "bun run dev" },
      { label: "apps/server dev", command: "pnpm run dev" },
    ]);
  });

  it("caps the list so the setup form stays compact", () => {
    const suggestions = previewCommandSuggestions({
      targets: [
        target({
          scripts: Array.from({ length: 10 }, (_unused, index) => ({
            name: `dev:${String(index)}`,
            command: `bun run dev:${String(index)}`,
          })),
        }),
      ],
      limit: 4,
    });

    expect(suggestions).toHaveLength(4);
  });

  it("returns nothing when discovery found no package.json", () => {
    expect(previewCommandSuggestions({ targets: [] })).toEqual([]);
  });
});
