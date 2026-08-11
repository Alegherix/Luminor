// FILE: previewCommandSuggestions.ts
// Purpose: Turn discovered package.json scripts into preview command suggestions.
// Layer: Web preview logic
// Exports: previewCommandSuggestions, PreviewCommandSuggestion, PREVIEW_COMMAND_SUGGESTION_LIMIT

import type { ProjectDiscoveredScriptTarget } from "@luminor/contracts";

import { discoveredScriptLabel } from "./projectRunTargets";

export const PREVIEW_COMMAND_SUGGESTION_LIMIT = 6;

const PREVIEW_SCRIPT_NAME_PATTERN = /^(dev|start|serve|preview)(:|$)/;

export interface PreviewCommandSuggestion {
  readonly label: string;
  readonly command: string;
}

/** Scripts whose name reads like a dev server come first and, when any exist, alone: a
 * preview pane that offers `bun run lint` next to `bun run dev` is noise. Repositories
 * without such a script still get every discovered script rather than an empty list. */
export function previewCommandSuggestions(input: {
  targets: readonly ProjectDiscoveredScriptTarget[];
  limit?: number;
}): PreviewCommandSuggestion[] {
  const discovered = input.targets.flatMap((target) =>
    target.scripts.map((script) => ({
      label: discoveredScriptLabel({ target, scriptName: script.name }),
      command: script.command,
      previewLike: PREVIEW_SCRIPT_NAME_PATTERN.test(script.name),
    })),
  );
  const previewLike = discovered.filter((entry) => entry.previewLike);
  const ranked = previewLike.length > 0 ? previewLike : discovered;

  const suggestions: PreviewCommandSuggestion[] = [];
  const seenCommands = new Set<string>();
  const limit = input.limit ?? PREVIEW_COMMAND_SUGGESTION_LIMIT;
  for (const entry of ranked) {
    if (suggestions.length >= limit) {
      break;
    }
    if (seenCommands.has(entry.command)) {
      continue;
    }
    seenCommands.add(entry.command);
    suggestions.push({ label: entry.label, command: entry.command });
  }
  return suggestions;
}
