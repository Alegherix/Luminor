import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("091_ThreadFolderMembership", (it) => {
  it.effect("adds nullable Folder membership to existing Threads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 90 });
      const before = yield* sql<{ readonly name: string }>`
        SELECT name FROM pragma_table_info('projection_threads') WHERE name = 'folder_id'
      `;
      assert.deepStrictEqual(before, []);

      const executed = yield* runMigrations({ toMigrationInclusive: 91 });
      assert.deepStrictEqual(executed, [[91, "ThreadFolderMembership"]]);
      const after = yield* sql<{ readonly name: string }>`
        SELECT name FROM pragma_table_info('projection_threads') WHERE name = 'folder_id'
      `;
      assert.deepStrictEqual(after, [{ name: "folder_id" }]);
    }),
  );
});
