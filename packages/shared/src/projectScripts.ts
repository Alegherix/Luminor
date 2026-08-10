import type { ProjectScript, ProjectScriptKind } from "@luminor/contracts";

const SINGLE_HOLDER_KINDS = [
  "setup",
  "preview",
] as const satisfies ReadonlyArray<ProjectScriptKind>;

export interface ProjectScriptRuntimeEnvInput {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
  extraEnv?: Record<string, string>;
}

export function projectScriptCwd(input: {
  project: {
    cwd: string;
  };
  worktreePath?: string | null;
}): string {
  return input.worktreePath ?? input.project.cwd;
}

export function projectScriptRuntimeEnv(
  input: ProjectScriptRuntimeEnvInput,
): Record<string, string> {
  const env: Record<string, string> = {
    LUMINOR_PROJECT_ROOT: input.project.cwd,
  };
  if (input.worktreePath) {
    env.LUMINOR_WORKTREE_PATH = input.worktreePath;
  }
  if (input.extraEnv) {
    return { ...env, ...input.extraEnv };
  }
  return env;
}

export function previewProjectScript(scripts: ReadonlyArray<ProjectScript>): ProjectScript | null {
  return scripts.find((script) => script.kind === "preview") ?? null;
}

export function normalizeProjectScriptRoles(
  scripts: ReadonlyArray<ProjectScript>,
  preferredScriptId?: string,
): ProjectScript[] {
  const holderIds = new Map<ProjectScriptKind, string>();

  for (const kind of SINGLE_HOLDER_KINDS) {
    const preferred = scripts.find(
      (script) => script.id === preferredScriptId && script.kind === kind,
    );
    const holder = preferred ?? scripts.find((script) => script.kind === kind);
    if (holder) holderIds.set(kind, holder.id);
  }

  return scripts.map((script) => {
    if (script.kind === "manual" || holderIds.get(script.kind) === script.id) return script;
    return { ...script, kind: "manual" };
  });
}
