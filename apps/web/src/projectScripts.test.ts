import type { ProjectScript } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import {
  commandForProjectScript,
  nextProjectScriptId,
  previewProjectScript,
  primaryProjectScript,
  projectScriptCwd,
  projectScriptRuntimeEnv,
  projectScriptIdFromCommand,
  projectScriptUrlTemplateOrNull,
  setupProjectScript,
  upsertPreviewProjectScript,
} from "./projectScripts";

describe("projectScripts helpers", () => {
  it("builds and parses script run commands", () => {
    const command = commandForProjectScript("lint");
    expect(command).toBe("script.lint.run");
    expect(projectScriptIdFromCommand(command)).toBe("lint");
    expect(projectScriptIdFromCommand("terminal.toggle")).toBeNull();
  });

  it("slugifies and dedupes project script ids", () => {
    expect(nextProjectScriptId("Run Tests", [])).toBe("run-tests");
    expect(nextProjectScriptId("Run Tests", ["run-tests"])).toBe("run-tests-2");
    expect(nextProjectScriptId("!!!", [])).toBe("script");
  });

  it("resolves primary and setup scripts", () => {
    const scripts = [
      {
        id: "setup",
        name: "Setup",
        command: "bun install",
        icon: "configure" as const,
        kind: "setup" as const,
      },
      {
        id: "preview",
        name: "Preview",
        command: "bun dev",
        icon: "play" as const,
        kind: "preview" as const,
      },
      {
        id: "test",
        name: "Test",
        command: "bun test",
        icon: "test" as const,
        kind: "manual" as const,
      },
    ];

    expect(primaryProjectScript(scripts)?.id).toBe("test");
    expect(setupProjectScript(scripts)?.id).toBe("setup");
    expect(primaryProjectScript(scripts.slice(0, 2))).toBeNull();
  });

  it("builds default runtime env for scripts", () => {
    const env = projectScriptRuntimeEnv({
      project: { cwd: "/repo" },
      worktreePath: "/repo/worktree-a",
    });

    expect(env).toMatchObject({
      LUMINOR_PROJECT_ROOT: "/repo",
      LUMINOR_WORKTREE_PATH: "/repo/worktree-a",
    });
  });

  it("allows overriding runtime env values", () => {
    const env = projectScriptRuntimeEnv({
      project: { cwd: "/repo" },
      extraEnv: {
        LUMINOR_PROJECT_ROOT: "/custom-root",
        CUSTOM_FLAG: "1",
      },
    });

    expect(env.LUMINOR_PROJECT_ROOT).toBe("/custom-root");
    expect(env.CUSTOM_FLAG).toBe("1");
    expect(env.LUMINOR_WORKTREE_PATH).toBeUndefined();
  });

  it("prefers the worktree path for script cwd resolution", () => {
    expect(
      projectScriptCwd({
        project: { cwd: "/repo" },
        worktreePath: "/repo/worktree-a",
      }),
    ).toBe("/repo/worktree-a");
    expect(
      projectScriptCwd({
        project: { cwd: "/repo" },
        worktreePath: null,
      }),
    ).toBe("/repo");
  });
});

describe("upsertPreviewProjectScript", () => {
  const manualScript: ProjectScript = {
    id: "test",
    name: "Test",
    command: "bun run test",
    icon: "test",
    kind: "manual",
  };

  it("appends a preview script when the project has none", () => {
    const result = upsertPreviewProjectScript([manualScript], {
      command: "bun run dev",
      urlTemplate: "http://localhost:{port}",
    });

    expect(result.scriptId).toBe("preview");
    expect(previewProjectScript(result.scripts)).toEqual({
      id: "preview",
      name: "Preview",
      command: "bun run dev",
      icon: "play",
      kind: "preview",
      urlTemplate: "http://localhost:{port}",
    });
    expect(result.scripts).toContainEqual(manualScript);
  });

  it("edits the existing preview script in place and keeps its identity", () => {
    const existing: ProjectScript = {
      id: "serve",
      name: "Serve site",
      command: "bun run dev",
      icon: "build",
      kind: "preview",
      urlTemplate: "http://localhost:3000",
    };

    const result = upsertPreviewProjectScript([existing, manualScript], {
      command: "bun run dev --port 4000",
      urlTemplate: null,
    });

    expect(result.scriptId).toBe("serve");
    expect(result.scripts).toHaveLength(2);
    expect(result.scripts[0]).toEqual({
      id: "serve",
      name: "Serve site",
      command: "bun run dev --port 4000",
      icon: "build",
      kind: "preview",
      urlTemplate: null,
    });
  });

  it("leaves a single preview script behind when the project carries several", () => {
    const stalePreview: ProjectScript = {
      id: "old-preview",
      name: "Old preview",
      command: "bun run serve",
      icon: "play",
      kind: "preview",
    };
    const primaryPreview: ProjectScript = {
      id: "serve",
      name: "Serve",
      command: "bun run dev",
      icon: "play",
      kind: "preview",
    };

    const result = upsertPreviewProjectScript([primaryPreview, stalePreview], {
      command: "bun run dev --host",
      urlTemplate: null,
    });

    expect(result.scriptId).toBe("serve");
    expect(result.scripts.filter((script) => script.kind === "preview")).toHaveLength(1);
    expect(previewProjectScript(result.scripts)?.id).toBe("serve");
    expect(result.scripts.find((script) => script.id === "old-preview")?.kind).toBe("manual");
  });
});

describe("projectScriptUrlTemplateOrNull", () => {
  it("trims a template and treats blank input as absent", () => {
    expect(projectScriptUrlTemplateOrNull("  http://localhost:{port}  ")).toBe(
      "http://localhost:{port}",
    );
    expect(projectScriptUrlTemplateOrNull("   ")).toBeNull();
    expect(projectScriptUrlTemplateOrNull("")).toBeNull();
  });
});
