import type { ProjectScript, ProjectScriptKind } from "@luminor/contracts";

const SINGLE_HOLDER_KINDS = [
  "setup",
  "preview",
] as const satisfies ReadonlyArray<ProjectScriptKind>;

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
