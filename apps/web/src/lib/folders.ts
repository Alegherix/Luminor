import type { FolderId, FolderOwner, NativeApi, ThreadId } from "@luminor/contracts";

import { newCommandId, newFolderId } from "./utils";

export async function createFolder(input: {
  api: NativeApi;
  owner: FolderOwner;
  name: string;
}): Promise<FolderId> {
  const folderId = newFolderId();
  await input.api.orchestration.dispatchCommand({
    type: "folder.create",
    commandId: newCommandId(),
    folderId,
    owner: input.owner,
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

export async function setFolderPinned(input: {
  api: NativeApi;
  folderId: FolderId;
  isPinned: boolean;
}): Promise<void> {
  await input.api.orchestration.dispatchCommand({
    type: "folder.pin",
    commandId: newCommandId(),
    folderId: input.folderId,
    isPinned: input.isPinned,
  });
}

export async function deleteFolder(input: { api: NativeApi; folderId: FolderId }): Promise<void> {
  await input.api.orchestration.dispatchCommand({
    type: "folder.delete",
    commandId: newCommandId(),
    folderId: input.folderId,
  });
}

export async function moveThreadToFolder(input: {
  api: NativeApi;
  threadId: ThreadId;
  folderId: FolderId | null;
}): Promise<void> {
  await input.api.orchestration.dispatchCommand({
    type: "thread.meta.update",
    commandId: newCommandId(),
    threadId: input.threadId,
    folderId: input.folderId,
  });
}
