import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const spaceColumns = yield* sql<{ readonly name: string }>`
    SELECT name FROM pragma_table_info('projection_folders') WHERE name = 'space_id'
  `;

  if (spaceColumns.length === 0) {
    yield* sql`
      CREATE TABLE projection_folders_space_owner (
        folder_id TEXT PRIMARY KEY,
        project_id TEXT,
        space_id TEXT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        CHECK (
          (project_id IS NOT NULL AND space_id IS NULL)
          OR (project_id IS NULL AND space_id IS NOT NULL)
        )
      )
    `;
    yield* sql`
      INSERT INTO projection_folders_space_owner (
        folder_id, project_id, space_id, name, sort_order, is_pinned,
        created_at, updated_at, deleted_at
      )
      SELECT
        folder_id, project_id, NULL, name, sort_order, is_pinned,
        created_at, updated_at, deleted_at
      FROM projection_folders
    `;
    yield* sql`DROP TABLE projection_folders`;
    yield* sql`ALTER TABLE projection_folders_space_owner RENAME TO projection_folders`;
  }

  yield* sql`DROP INDEX IF EXISTS idx_projection_folders_project_order`;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_folders_owner_order
    ON projection_folders(project_id, space_id, deleted_at, sort_order, folder_id)
  `;
});
