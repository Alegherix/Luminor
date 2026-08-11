import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const tableColumns = (sql: SqlClient.SqlClient, tableName: string) =>
  sql<{ readonly name: string }>`
    SELECT name FROM pragma_table_info(${tableName})
  `.pipe(Effect.map((rows) => rows.map((row) => row.name)));

layer("090_Folders", (it) => {
  it.effect("adds durable project Folder storage", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 89 });

      assert.deepStrictEqual(yield* tableColumns(sql, "projection_folders"), []);
      const executed = yield* runMigrations({ toMigrationInclusive: 90 });
      assert.deepStrictEqual(executed, [[90, "Folders"]]);
      assert.deepStrictEqual(yield* tableColumns(sql, "projection_folders"), [
        "folder_id",
        "project_id",
        "name",
        "sort_order",
        "is_pinned",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);
    }),
  );
});
