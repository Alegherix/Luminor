import type { ModelSelection, ProviderKind } from "@luminor/contracts";

import { resolvePreferredComposerModelSelection } from "../composerDraftModels";

const DEDICATED_TEXT_GENERATION_PROVIDERS = new Set<ProviderKind>([
  "codex",
  "cursor",
  "kilo",
  "opencode",
]);

export function isDedicatedTextGenerationSelection(selection: ModelSelection): boolean {
  return DEDICATED_TEXT_GENERATION_PROVIDERS.has(selection.provider);
}

export function resolveNewThreadDefaultModelSelection(input: {
  readonly projectDefaultModelSelection?: ModelSelection | null;
  readonly threadModelSelection?: ModelSelection | null;
  readonly defaultProvider?: ProviderKind | null;
}): ModelSelection {
  return resolvePreferredComposerModelSelection({
    draft: null,
    threadModelSelection: input.threadModelSelection ?? null,
    projectModelSelection: input.projectDefaultModelSelection ?? null,
    defaultProvider: input.defaultProvider,
  });
}
