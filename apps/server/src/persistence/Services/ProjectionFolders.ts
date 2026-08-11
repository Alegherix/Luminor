import { FolderId, FolderName, FolderOwner, IsoDateTime, NonNegativeInt } from "@luminor/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionFolder = Schema.Struct({
  folderId: FolderId,
  owner: FolderOwner,
  name: FolderName,
  sortOrder: NonNegativeInt,
  isPinned: Schema.Number,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionFolder = typeof ProjectionFolder.Type;

export const GetProjectionFolderInput = Schema.Struct({ folderId: FolderId });
export type GetProjectionFolderInput = typeof GetProjectionFolderInput.Type;

export const MarkProjectionFoldersDeletedByOwnerInput = Schema.Struct({
  owner: FolderOwner,
  deletedAt: IsoDateTime,
});
export type MarkProjectionFoldersDeletedByOwnerInput =
  typeof MarkProjectionFoldersDeletedByOwnerInput.Type;

export interface ProjectionFolderRepositoryShape {
  readonly upsert: (row: ProjectionFolder) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getById: (
    input: GetProjectionFolderInput,
  ) => Effect.Effect<Option.Option<ProjectionFolder>, ProjectionRepositoryError>;
  readonly listAll: () => Effect.Effect<ReadonlyArray<ProjectionFolder>, ProjectionRepositoryError>;
  readonly markDeletedByOwner: (
    input: MarkProjectionFoldersDeletedByOwnerInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionFolderRepository extends ServiceMap.Service<
  ProjectionFolderRepository,
  ProjectionFolderRepositoryShape
>()("luminor/persistence/Services/ProjectionFolders/ProjectionFolderRepository") {}
