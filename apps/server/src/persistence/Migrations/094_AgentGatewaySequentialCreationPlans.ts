import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [table] = yield* sql<{ readonly sql: string | null }>`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'agent_gateway_operations'
  `;
  if (table?.sql?.includes("operation_kind, request_id")) return;

  yield* sql`
    CREATE TABLE agent_gateway_operations_sequential_plans (
      operation_id TEXT PRIMARY KEY,
      caller_thread_id TEXT NOT NULL,
      caller_turn_id TEXT NOT NULL,
      operation_kind TEXT NOT NULL CHECK (operation_kind IN ('create_threads')),
      request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 256),
      fingerprint TEXT NOT NULL,
      requested_count INTEGER NOT NULL CHECK (requested_count BETWEEN 1 AND 20),
      plan_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('reserved', 'dispatching', 'completed', 'failed', 'compensating')
      ),
      result_json TEXT,
      error_json TEXT,
      caller_purged_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (caller_thread_id, caller_turn_id, operation_kind, request_id)
    )
  `;
  yield* sql`
    INSERT INTO agent_gateway_operations_sequential_plans (
      operation_id, caller_thread_id, caller_turn_id, operation_kind,
      request_id, fingerprint, requested_count, plan_json, status,
      result_json, error_json, caller_purged_at, created_at, updated_at
    )
    SELECT
      operation_id, caller_thread_id, caller_turn_id, operation_kind,
      request_id, fingerprint, requested_count, plan_json, status,
      result_json, error_json, caller_purged_at, created_at, updated_at
    FROM agent_gateway_operations
  `;
  yield* sql`DROP TABLE agent_gateway_operations`;
  yield* sql`
    ALTER TABLE agent_gateway_operations_sequential_plans
    RENAME TO agent_gateway_operations
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_agent_gateway_operations_status
    ON agent_gateway_operations (status, updated_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_agent_gateway_operations_scope
    ON agent_gateway_operations (caller_thread_id, caller_turn_id, operation_kind, created_at)
  `;
});
