import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [column] = yield* sql<{ readonly exists: number }>`
    SELECT EXISTS(
      SELECT 1
      FROM pragma_table_info('projection_threads')
      WHERE name = 'folder_id'
    ) AS "exists"
  `;
  if (column?.exists !== 1) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN folder_id TEXT`;
  }
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_folder
    ON projection_threads(folder_id, deleted_at, created_at, thread_id)
  `;
});
