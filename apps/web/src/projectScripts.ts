import {
  MAX_SCRIPT_ID_LENGTH,
  SCRIPT_RUN_COMMAND_PATTERN,
  type KeybindingCommand,
  type ProjectScript,
} from "@luminor/contracts";
import {
  normalizeProjectScriptRoles,
  previewProjectScript,
  projectScriptCwd,
  projectScriptRuntimeEnv,
  type ProjectScriptRuntimeEnvInput,
} from "@luminor/shared/projectScripts";
import { Schema } from "effect";

export {
  previewProjectScript,
  projectScriptCwd,
  projectScriptRuntimeEnv,
  type ProjectScriptRuntimeEnvInput,
};

function normalizeScriptId(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (cleaned.length === 0) {
    return "script";
  }
  if (cleaned.length <= MAX_SCRIPT_ID_LENGTH) {
    return cleaned;
  }
  return cleaned.slice(0, MAX_SCRIPT_ID_LENGTH).replace(/-+$/g, "") || "script";
}

export const commandForProjectScript = (scriptId: string): KeybindingCommand =>
  SCRIPT_RUN_COMMAND_PATTERN.makeUnsafe(`script.${scriptId}.run`);

export function projectScriptIdFromCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!Schema.is(SCRIPT_RUN_COMMAND_PATTERN)(trimmed)) {
    return null;
  }
  const [prefix, , suffix] = SCRIPT_RUN_COMMAND_PATTERN.parts;
  return trimmed.slice(prefix.literal.length, -suffix.literal.length);
}

export function nextProjectScriptId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(Array.from(existingIds));
  const baseId = normalizeScriptId(name);
  if (!taken.has(baseId)) return baseId;

  let suffix = 2;
  while (suffix < 10_000) {
    const candidate = `${baseId}-${suffix}`;
    const safeCandidate =
      candidate.length <= MAX_SCRIPT_ID_LENGTH
        ? candidate
        : `${baseId.slice(0, Math.max(1, MAX_SCRIPT_ID_LENGTH - String(suffix).length - 1))}-${suffix}`;
    if (!taken.has(safeCandidate)) {
      return safeCandidate;
    }
    suffix += 1;
  }

  // This last-resort fallback only triggers after exhausting thousands of suffixes.
  return `${baseId}-${Date.now()}`.slice(0, MAX_SCRIPT_ID_LENGTH);
}

export interface ProjectScriptRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  worktreePath?: string | null;
  preferNewTerminal?: boolean;
  rememberAsLastInvoked?: boolean;
  throwOnError?: boolean;
}

export interface ProjectScriptRunResult {
  terminalId: string;
}

export function primaryProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.kind === "manual") ?? null;
}

export function setupProjectScript(scripts: ProjectScript[]): ProjectScript | null {
  return scripts.find((script) => script.kind === "setup") ?? null;
}

export const PREVIEW_PROJECT_SCRIPT_NAME = "Preview";

export interface PreviewProjectScriptDraft {
  readonly command: string;
  readonly urlTemplate: string | null;
}

export interface PreviewProjectScriptUpsert {
  readonly scripts: ProjectScript[];
  readonly scriptId: string;
}

export function projectScriptUrlTemplateOrNull(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function upsertPreviewProjectScript(
  scripts: ReadonlyArray<ProjectScript>,
  draft: PreviewProjectScriptDraft,
): PreviewProjectScriptUpsert {
  const existing = previewProjectScript(scripts);
  const scriptId =
    existing?.id ??
    nextProjectScriptId(
      PREVIEW_PROJECT_SCRIPT_NAME,
      scripts.map((script) => script.id),
    );
  const nextScript: ProjectScript = {
    id: scriptId,
    name: existing?.name ?? PREVIEW_PROJECT_SCRIPT_NAME,
    icon: existing?.icon ?? "play",
    kind: "preview",
    command: draft.command,
    urlTemplate: draft.urlTemplate,
  };
  const merged = existing
    ? scripts.map((script) => (script.id === scriptId ? nextScript : script))
    : [...scripts, nextScript];
  return { scripts: normalizeProjectScriptRoles(merged, scriptId), scriptId };
}
