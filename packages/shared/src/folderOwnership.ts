import type { FolderOwner, ProjectId } from "@luminor/contracts";

export type FolderOwnerKey = `${FolderOwner["kind"]}:${string}`;

export function projectFolderOwner(projectId: ProjectId): FolderOwner {
  return { kind: "project", projectId };
}

export function projectFolderOwnerKey(projectId: ProjectId): FolderOwnerKey {
  return folderOwnerKey(projectFolderOwner(projectId));
}

export function folderOwnerKey(owner: FolderOwner): FolderOwnerKey {
  return `${owner.kind}:${owner.projectId}`;
}

export function folderOwnersEqual(left: FolderOwner, right: FolderOwner): boolean {
  return folderOwnerKey(left) === folderOwnerKey(right);
}

export function projectIdFromFolderOwner(owner: FolderOwner): ProjectId {
  return owner.projectId;
}
