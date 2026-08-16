import { describe, expect, it } from "vitest";

import {
  buildResourceProcessTree,
  classifyResourceProcesses,
  detectResourceProcessKind,
  formatResourceCpu,
  formatResourceRss,
  resourceProcessFingerprint,
  type ResourceProcessRow,
} from "./resourceProcesses";

function row(partial: Partial<ResourceProcessRow> & Pick<ResourceProcessRow, "pid" | "args">): ResourceProcessRow {
  return {
    ppid: 1,
    rssKb: 100_000,
    cpu: 0.2,
    elapsedSeconds: 120,
    comm: "node",
    ...partial,
  };
}

describe("detectResourceProcessKind", () => {
  it("recognizes leftover tools and host services", () => {
    expect(detectResourceProcessKind(row({ pid: 1, comm: "webpack", args: "webpack" }))).toBe("webpack");
    expect(
      detectResourceProcessKind(row({ pid: 2, comm: "java", args: "java org.gradle.launcher.daemon.bootstrap.GradleDaemon" })),
    ).toBe("gradle");
    expect(detectResourceProcessKind(row({ pid: 3, comm: "iii", args: "/home/a/.local/bin/iii --config foo" }))).toBe(
      "iii",
    );
    expect(
      detectResourceProcessKind(row({ pid: 4, comm: "llama-server", args: "/opt/llama-server --model blob" })),
    ).toBe("ollama");
  });

  it("recognizes Luminor-adjacent agent processes", () => {
    expect(
      detectResourceProcessKind(row({ pid: 5, comm: "grok", args: "grok --permission-mode default agent" })),
    ).toBe("grok");
    expect(
      detectResourceProcessKind(row({ pid: 6, comm: "codex", args: "codex app-server --listen stdio" })),
    ).toBe("codex");
    expect(
      detectResourceProcessKind(row({ pid: 7, args: "npm exec repomix --mcp" })),
    ).toBe("repomix-mcp");
    expect(
      detectResourceProcessKind(row({ pid: 8, args: "node /x/codegraph.js serve --mcp --path /repo" })),
    ).toBe("codegraph");
  });
});

describe("classifyResourceProcesses", () => {
  it("protects this Luminor instance and marks extra MCP copies as leftovers", () => {
    const classified = classifyResourceProcesses({
      selfPid: 100,
      selfCwd: "/repo/luminor",
      rows: [
        row({ pid: 100, comm: "bun", args: "bun apps/server/src/index.ts", rssKb: 300_000 }),
        row({
          pid: 400,
          comm: "node",
          args: "node /home/a/Luminor/apps/web/node_modules/.bin/eslint",
          rssKb: 80_000,
        }),
        row({ pid: 101, ppid: 100, comm: "electron", args: "electron --luminor-dev-root=/repo/luminor", rssKb: 800_000 }),
        row({ pid: 200, comm: "node", args: "npm exec repomix --mcp", elapsedSeconds: 60, rssKb: 200_000 }),
        row({ pid: 201, comm: "node", args: "npm exec repomix --mcp", elapsedSeconds: 4_000, rssKb: 210_000 }),
        row({ pid: 300, comm: "webpack", args: "webpack", elapsedSeconds: 40_000, cpu: 0, rssKb: 2_200_000 }),
      ],
    });

    const self = classified.find((item) => item.row.pid === 100);
    const child = classified.find((item) => item.row.pid === 101);
    const liveMcp = classified.find((item) => item.row.pid === 200);
    const extraMcp = classified.find((item) => item.row.pid === 201);
    const webpack = classified.find((item) => item.row.pid === 300);
    const eslint = classified.find((item) => item.row.pid === 400);

    expect(eslint).toBeUndefined();
    expect(self?.group).toBe("app");
    expect(self?.canStop).toBe(false);
    expect(child?.group).toBe("app");
    expect(child?.canStop).toBe(false);
    expect(liveMcp?.group).toBe("agents");
    expect(extraMcp?.group).toBe("leftovers");
    expect(extraMcp?.canStop).toBe(true);
    expect(webpack?.group).toBe("leftovers");
    expect(webpack?.status).toBe("dead");
  });
});

describe("buildResourceProcessTree", () => {
  it("collapses leftover MCP copies and sums RSS", () => {
    const classified = classifyResourceProcesses({
      selfPid: 10,
      rows: [
        row({ pid: 10, comm: "bun", args: "bun apps/server/src/index.ts" }),
        row({ pid: 20, comm: "node", args: "npm exec @agentmemory/mcp", elapsedSeconds: 30 }),
        row({ pid: 21, comm: "node", args: "npm exec @agentmemory/mcp", elapsedSeconds: 400 }),
        row({ pid: 22, comm: "node", args: "npm exec @agentmemory/mcp", elapsedSeconds: 800 }),
      ],
    });
    const tree = buildResourceProcessTree(classified);
    const leftovers = tree.groups.find((group) => group.group === "leftovers");
    expect(leftovers?.children.some((leaf) => leaf.name.includes("×2"))).toBe(true);
    expect(tree.processCount).toBeGreaterThanOrEqual(3);
  });
});

describe("formatters", () => {
  it("formats rss and cpu", () => {
    expect(formatResourceRss(12.4)).toBe("12.4 MB");
    expect(formatResourceRss(3010)).toBe("2.94 GB");
    expect(formatResourceCpu(0.01)).toBe("0.0%");
    expect(formatResourceCpu(6.61)).toBe("6.6%");
  });

  it("builds a stable fingerprint", () => {
    const value = resourceProcessFingerprint({ pid: 9, comm: "node", args: "repomix --mcp" });
    expect(value.startsWith("9:node:")).toBe(true);
  });
});
