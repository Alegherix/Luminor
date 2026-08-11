// FILE: useProjectPreviewScript.ts
// Purpose: Reads and writes the single preview script of a project from any preview surface.
// Layer: Web preview controller hook
// Exports: useProjectPreviewScript, ProjectPreviewScriptController

import type { ProjectId, ProjectScript } from "@luminor/contracts";
import { useCallback, useMemo } from "react";

import { newCommandId } from "~/lib/utils";
import { readNativeApi } from "../nativeApi";
import {
  previewProjectScript,
  upsertPreviewProjectScript,
  type PreviewProjectScriptDraft,
} from "../projectScripts";
import { useStore } from "../store";
import { createProjectSelector } from "../storeSelectors";

export const PREVIEW_SCRIPT_REQUIRES_PROJECT_MESSAGE =
  "This thread has no project to save a preview command on.";

export interface ProjectPreviewScriptController {
  readonly script: ProjectScript | null;
  readonly save: (draft: PreviewProjectScriptDraft) => Promise<void>;
}

export function useProjectPreviewScript(
  projectId: ProjectId | null,
): ProjectPreviewScriptController {
  const project = useStore(useMemo(() => createProjectSelector(projectId), [projectId]));
  const scripts = project?.kind === "project" ? project.scripts : null;
  const script = scripts ? previewProjectScript(scripts) : null;

  const save = useCallback(
    async (draft: PreviewProjectScriptDraft) => {
      const api = readNativeApi();
      if (!api || !project || !scripts) {
        throw new Error(PREVIEW_SCRIPT_REQUIRES_PROJECT_MESSAGE);
      }
      const next = upsertPreviewProjectScript(scripts, draft);
      await api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId: project.id,
        scripts: next.scripts,
      });
    },
    [project, scripts],
  );

  return { script, save };
}
