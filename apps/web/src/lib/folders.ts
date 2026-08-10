import type { FolderId, NativeApi, ProjectId } from "@luminor/contracts";

import { newCommandId, newFolderId } from "./utils";

export async function createFolder(input: {
  api: NativeApi;
  projectId: ProjectId;
  name: string;
}): Promise<FolderId> {
  const folderId = newFolderId();
  await input.api.orchestration.dispatchCommand({
    type: "folder.create",
    commandId: newCommandId(),
    folderId,
    projectId: input.projectId,
    name: input.name,
    createdAt: new Date().toISOString(),
  });
  return folderId;
}

export async function renameFolder(input: {
  api: NativeApi;
  folderId: FolderId;
  name: string;
}): Promise<void> {
  await input.api.orchestration.dispatchCommand({
    type: "folder.rename",
    commandId: newCommandId(),
    folderId: input.folderId,
    name: input.name,
  });
}

export async function deleteFolder(input: { api: NativeApi; folderId: FolderId }): Promise<void> {
  await input.api.orchestration.dispatchCommand({
    type: "folder.delete",
    commandId: newCommandId(),
    folderId: input.folderId,
  });
}
