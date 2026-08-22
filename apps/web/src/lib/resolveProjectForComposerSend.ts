// FILE: resolveProjectForComposerSend.ts
// Purpose: Resolve the backing project row at composer send time when the shell snapshot
//          has not been projected into the local store yet (common for brand-new chats).
// Layer: Web orchestration helper
// Exports: resolveProjectForComposerSend

import type { NativeApi, OrchestrationShellSnapshot, ProjectId } from "@luminor/contracts";

import { useStore } from "../store";
import type { Project } from "../types";
import { waitForRecoverableProjectInReadModel } from "./projectCreateRecovery";

const COMPOSER_SEND_RECOVERABLE_PROJECT_KINDS = new Set(["project", "chat"]);

export async function resolveProjectForComposerSend(input: {
  readonly api: NativeApi;
  readonly projectId: ProjectId;
  readonly syncShellSnapshot: (snapshot: OrchestrationShellSnapshot) => void;
}): Promise<Project | null> {
  const existing = useStore.getState().projects.find((project) => project.id === input.projectId);
  if (existing) {
    return existing;
  }

  const { project, snapshot } = await waitForRecoverableProjectInReadModel({
    projectId: input.projectId,
    loadSnapshot: () => input.api.orchestration.getShellSnapshot().catch(() => null),
    recoverableKinds: COMPOSER_SEND_RECOVERABLE_PROJECT_KINDS,
  });

  if (snapshot) {
    input.syncShellSnapshot(snapshot);
  }

  if (!project) {
    return null;
  }

  return useStore.getState().projects.find((candidate) => candidate.id === input.projectId) ?? null;
}
