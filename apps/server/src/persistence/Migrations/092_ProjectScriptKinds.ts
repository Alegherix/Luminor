import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    UPDATE projection_projects
    SET scripts_json = (
      SELECT json_group_array(
        json(
          CASE json_type(script.value, '$.runOnWorktreeCreate')
            WHEN 'true' THEN json_set(
              json_remove(script.value, '$.runOnWorktreeCreate'),
              '$.kind',
              'setup'
            )
            WHEN 'false' THEN json_set(
              json_remove(script.value, '$.runOnWorktreeCreate'),
              '$.kind',
              'manual'
            )
            ELSE script.value
          END
        )
      )
      FROM json_each(projection_projects.scripts_json) AS script
    )
    WHERE json_valid(scripts_json)
      AND EXISTS (
        SELECT 1
        FROM json_each(projection_projects.scripts_json) AS script
        WHERE json_type(script.value, '$.runOnWorktreeCreate') IN ('true', 'false')
      )
  `;
});
