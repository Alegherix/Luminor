import { assert, it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("093_SpaceFolderOwnership", (it) => {
  it.effect("rebuilds Folder storage while preserving project-owned rows", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 92 });
      yield* sql`
        INSERT INTO projection_folders (
          folder_id, project_id, name, sort_order, is_pinned, created_at, updated_at, deleted_at
        ) VALUES (
          'folder-before-space-ownership', 'project-existing', 'Existing folder', 3, 1,
          '2026-08-10T10:00:00.000Z', '2026-08-10T11:00:00.000Z', NULL
        )
      `;

      const executed = yield* runMigrations({ toMigrationInclusive: 93 });
      assert.deepStrictEqual(executed, [[93, "SpaceFolderOwnership"]]);

      const columns = yield* sql<{ readonly name: string; readonly notNull: number }>`
        SELECT name, "notnull" AS "notNull" FROM pragma_table_info('projection_folders')
      `;
      assert.deepStrictEqual(
        columns.filter((column) => column.name === "project_id" || column.name === "space_id"),
        [
          { name: "project_id", notNull: 0 },
          { name: "space_id", notNull: 0 },
        ],
      );

      const rows = yield* sql<{
        readonly folderId: string;
        readonly projectId: string | null;
        readonly spaceId: string | null;
        readonly name: string;
        readonly sortOrder: number;
        readonly isPinned: number;
      }>`
        SELECT
          folder_id AS "folderId",
          project_id AS "projectId",
          space_id AS "spaceId",
          name,
          sort_order AS "sortOrder",
          is_pinned AS "isPinned"
        FROM projection_folders
      `;
      assert.deepStrictEqual(rows, [
        {
          folderId: "folder-before-space-ownership",
          projectId: "project-existing",
          spaceId: null,
          name: "Existing folder",
          sortOrder: 3,
          isPinned: 1,
        },
      ]);

      const neitherOwner = yield* Effect.exit(sql`
        INSERT INTO projection_folders (
          folder_id, project_id, space_id, name, sort_order, is_pinned, created_at, updated_at
        ) VALUES ('folder-neither', NULL, NULL, 'Neither', 0, 0, '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')
      `);
      const bothOwners = yield* Effect.exit(sql`
        INSERT INTO projection_folders (
          folder_id, project_id, space_id, name, sort_order, is_pinned, created_at, updated_at
        ) VALUES ('folder-both', 'project', 'space', 'Both', 0, 0, '2026-08-11T00:00:00.000Z', '2026-08-11T00:00:00.000Z')
      `);
      assert.strictEqual(Exit.isFailure(neitherOwner), true);
      assert.strictEqual(Exit.isFailure(bothOwners), true);

      const indexes = yield* sql<{ readonly name: string }>`
        SELECT name FROM pragma_index_list('projection_folders')
      `;
      assert.strictEqual(
        indexes.some((index) => index.name === "idx_projection_folders_owner_order"),
        true,
      );
      assert.strictEqual(
        indexes.some((index) => index.name === "idx_projection_folders_project_order"),
        false,
      );
    }),
  );
});
