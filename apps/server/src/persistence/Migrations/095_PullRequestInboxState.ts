import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS pull_request_inbox_state (
      repository_key TEXT NOT NULL,
      pull_request_number INTEGER NOT NULL CHECK (pull_request_number > 0),
      last_viewed_at TEXT,
      last_notified_comment_id TEXT,
      PRIMARY KEY (repository_key, pull_request_number)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS pull_request_inbox_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      initialized_at TEXT NOT NULL
    )
  `;
});
