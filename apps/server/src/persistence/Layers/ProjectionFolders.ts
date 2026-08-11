import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Option, Schema } from "effect";
import { ProjectId } from "@luminor/contracts";
import { projectFolderOwner } from "@luminor/shared/folderOwnership";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  GetProjectionFolderInput,
  MarkProjectionFoldersDeletedByOwnerInput,
  ProjectionFolder,
  ProjectionFolderRepository,
  type ProjectionFolderRepositoryShape,
} from "../Services/ProjectionFolders.ts";

const { owner: _projectionFolderOwnerField, ...ProjectionFolderDbFields } = ProjectionFolder.fields;
const ProjectionFolderDbRow = Schema.Struct({
  ...ProjectionFolderDbFields,
  projectId: ProjectId,
});
type ProjectionFolderDbRow = typeof ProjectionFolderDbRow.Type;

function toProjectionFolder(row: ProjectionFolderDbRow): ProjectionFolder {
  const { projectId, ...folder } = row;
  return { ...folder, owner: projectFolderOwner(projectId) };
}

const makeProjectionFolderRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRow = SqlSchema.void({
    Request: ProjectionFolder,
    execute: (row) => sql`
      INSERT INTO projection_folders (
        folder_id, project_id, name, sort_order, is_pinned, created_at, updated_at, deleted_at
      ) VALUES (
        ${row.folderId}, ${row.owner.projectId}, ${row.name}, ${row.sortOrder}, ${row.isPinned},
        ${row.createdAt}, ${row.updatedAt}, ${row.deletedAt}
      )
      ON CONFLICT (folder_id) DO UPDATE SET
        project_id = excluded.project_id,
        name = excluded.name,
        sort_order = excluded.sort_order,
        is_pinned = excluded.is_pinned,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `,
  });

  const getRow = SqlSchema.findOneOption({
    Request: GetProjectionFolderInput,
    Result: ProjectionFolderDbRow,
    execute: ({ folderId }) => sql`
      SELECT
        folder_id AS "folderId",
        project_id AS "projectId",
        name,
        sort_order AS "sortOrder",
        is_pinned AS "isPinned",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
      FROM projection_folders
      WHERE folder_id = ${folderId}
    `,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionFolderDbRow,
    execute: () => sql`
      SELECT
        folder_id AS "folderId",
        project_id AS "projectId",
        name,
        sort_order AS "sortOrder",
        is_pinned AS "isPinned",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        deleted_at AS "deletedAt"
      FROM projection_folders
      ORDER BY project_id ASC, sort_order ASC, folder_id ASC
    `,
  });

  const markDeletedByOwnerRow = SqlSchema.void({
    Request: MarkProjectionFoldersDeletedByOwnerInput,
    execute: ({ owner, deletedAt }) => sql`
      UPDATE projection_folders
      SET
        deleted_at = ${deletedAt},
        updated_at = ${deletedAt}
      WHERE project_id = ${owner.projectId}
        AND deleted_at IS NULL
    `,
  });

  return {
    upsert: (row) =>
      upsertRow(row).pipe(
        Effect.mapError(toPersistenceSqlError("ProjectionFolderRepository.upsert:query")),
      ),
    getById: (input) =>
      getRow(input).pipe(
        Effect.map(Option.map(toProjectionFolder)),
        Effect.mapError(toPersistenceSqlError("ProjectionFolderRepository.getById:query")),
      ),
    listAll: () =>
      listRows().pipe(
        Effect.map((rows) => rows.map(toProjectionFolder)),
        Effect.mapError(toPersistenceSqlError("ProjectionFolderRepository.listAll:query")),
      ),
    markDeletedByOwner: (input) =>
      markDeletedByOwnerRow(input).pipe(
        Effect.mapError(
          toPersistenceSqlError("ProjectionFolderRepository.markDeletedByOwner:query"),
        ),
      ),
  } satisfies ProjectionFolderRepositoryShape;
});

export const ProjectionFolderRepositoryLive = Layer.effect(
  ProjectionFolderRepository,
  makeProjectionFolderRepository,
);
