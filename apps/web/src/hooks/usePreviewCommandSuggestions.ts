// FILE: usePreviewCommandSuggestions.ts
// Purpose: Offers a project's package.json scripts as preview command suggestions.
// Layer: Web preview controller hook
// Exports: usePreviewCommandSuggestions

import type { ProjectId } from "@luminor/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { projectDiscoverScriptsQueryOptions } from "../lib/projectReactQuery";
import {
  previewCommandSuggestions,
  type PreviewCommandSuggestion,
} from "../previewCommandSuggestions";
import { useStore } from "../store";
import { createProjectSelector } from "../storeSelectors";

export function usePreviewCommandSuggestions(
  projectId: ProjectId | null,
): readonly PreviewCommandSuggestion[] {
  const project = useStore(useMemo(() => createProjectSelector(projectId), [projectId]));
  const cwd = project?.kind === "project" ? project.cwd : null;
  const discovery = useQuery(projectDiscoverScriptsQueryOptions({ cwd }));
  const targets = discovery.data?.targets;

  return useMemo(() => previewCommandSuggestions({ targets: targets ?? [] }), [targets]);
}
