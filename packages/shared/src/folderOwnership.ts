import type { FolderOwner, ProjectId, SpaceId } from "@luminor/contracts";

export type FolderOwnerKey = `${FolderOwner["kind"]}:${string}`;

export function projectFolderOwner(projectId: ProjectId): FolderOwner {
  return { kind: "project", projectId };
}

export function projectFolderOwnerKey(projectId: ProjectId): FolderOwnerKey {
  return folderOwnerKey(projectFolderOwner(projectId));
}

export function spaceFolderOwner(spaceId: SpaceId): FolderOwner {
  return { kind: "space", spaceId };
}

export function spaceFolderOwnerKey(spaceId: SpaceId): FolderOwnerKey {
  return folderOwnerKey(spaceFolderOwner(spaceId));
}

export function folderOwnerKey(owner: FolderOwner): FolderOwnerKey {
  return owner.kind === "project"
    ? `${owner.kind}:${owner.projectId}`
    : `${owner.kind}:${owner.spaceId}`;
}

export function folderOwnersEqual(left: FolderOwner, right: FolderOwner): boolean {
  return folderOwnerKey(left) === folderOwnerKey(right);
}

export function projectIdFromFolderOwner(owner: FolderOwner): ProjectId | null {
  return owner.kind === "project" ? owner.projectId : null;
}

export function folderOwnerReferences(
  owner:
    | { readonly kind: "project"; readonly projectId: string }
    | { readonly kind: "space"; readonly spaceId: string },
): {
  readonly projectId: string | null;
  readonly spaceId: string | null;
} {
  return owner.kind === "project"
    ? { projectId: owner.projectId, spaceId: null }
    : { projectId: null, spaceId: owner.spaceId };
}

export function folderOwnerFromReferences(input: {
  readonly projectId: ProjectId | null;
  readonly spaceId: SpaceId | null;
}): FolderOwner {
  if (input.projectId !== null && input.spaceId === null) {
    return projectFolderOwner(input.projectId);
  }
  if (input.projectId === null && input.spaceId !== null) {
    return spaceFolderOwner(input.spaceId);
  }
  throw new Error("A folder must have exactly one owner reference.");
}
