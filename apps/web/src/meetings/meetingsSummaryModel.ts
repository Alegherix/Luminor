import type { ModelSelection, ProviderKind } from "@luminor/contracts";

import { resolvePreferredComposerModelSelection } from "../composerDraftModels";

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
