import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("094_AgentGatewaySequentialCreationPlans", (it) => {
  it.effect("widens the per-turn unique key without dropping existing operations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 93 });
      yield* sql`
        INSERT INTO agent_gateway_operations (
          operation_id, caller_thread_id, caller_turn_id, operation_kind,
          request_id, fingerprint, requested_count, plan_json, status,
          result_json, error_json, caller_purged_at, created_at, updated_at
        ) VALUES (
          'operation-before-waves', 'thread-before-waves', 'turn-before-waves',
          'create_threads', 'request-before-waves', 'fingerprint-before-waves',
          1, '[{"index":0}]', 'completed', '{"threadIds":["child-1"]}', NULL, NULL,
          '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:01.000Z'
        )
      `;

      const executed = yield* runMigrations({ toMigrationInclusive: 94 });
      assert.deepStrictEqual(executed, [[94, "AgentGatewaySequentialCreationPlans"]]);

      const [table] = yield* sql<{ readonly sql: string | null }>`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'agent_gateway_operations'
      `;
      assert.include(table?.sql ?? "", "operation_kind, request_id");

      const rows = yield* sql<{
        readonly operationId: string;
        readonly requestId: string;
        readonly status: string;
      }>`
        SELECT
          operation_id AS "operationId",
          request_id AS "requestId",
          status
        FROM agent_gateway_operations
        WHERE operation_id = 'operation-before-waves'
      `;
      assert.deepStrictEqual(rows, [
        {
          operationId: "operation-before-waves",
          requestId: "request-before-waves",
          status: "completed",
        },
      ]);

      yield* sql`
        INSERT INTO agent_gateway_operations (
          operation_id, caller_thread_id, caller_turn_id, operation_kind,
          request_id, fingerprint, requested_count, plan_json, status,
          result_json, error_json, caller_purged_at, created_at, updated_at
        ) VALUES (
          'operation-after-waves', 'thread-before-waves', 'turn-before-waves',
          'create_threads', 'request-after-waves', 'fingerprint-after-waves',
          1, '[{"index":1}]', 'reserved', NULL, NULL, NULL,
          '2026-08-12T00:00:02.000Z', '2026-08-12T00:00:02.000Z'
        )
      `;
      const count = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count
        FROM agent_gateway_operations
        WHERE caller_thread_id = 'thread-before-waves'
          AND caller_turn_id = 'turn-before-waves'
      `;
      assert.equal(count[0]?.count, 2);
    }),
  );
});
