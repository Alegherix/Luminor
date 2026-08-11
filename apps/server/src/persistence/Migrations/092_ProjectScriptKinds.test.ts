import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

it.effect("092_ProjectScriptKinds migrates persisted script roles", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 91 });
    yield* sql`
      INSERT INTO projection_projects (
        project_id, kind, title, workspace_root, scripts_json, created_at, updated_at
      ) VALUES
        (
          'legacy', 'project', 'Legacy', '/legacy',
          '[{"id":"setup","name":"Setup","command":"bun install","icon":"configure","runOnWorktreeCreate":true},{"id":"dev","name":"Dev","command":"bun dev","icon":"play","runOnWorktreeCreate":false}]',
          '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'
        ),
        (
          'current', 'project', 'Current', '/current',
          '[{"id":"preview","name":"Preview","command":"bun dev","icon":"play","kind":"preview"}]',
          '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z'
        )
    `;

    assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 92 }), [
      [92, "ProjectScriptKinds"],
    ]);

    const projects = yield* sql<{ readonly projectId: string; readonly scripts: string }>`
      SELECT project_id AS "projectId", scripts_json AS scripts
      FROM projection_projects
      WHERE project_id IN ('legacy', 'current')
      ORDER BY project_id
    `;
    assert.deepStrictEqual(
      projects.map((project) => ({
        projectId: project.projectId,
        scripts: JSON.parse(project.scripts),
      })),
      [
        {
          projectId: "current",
          scripts: [
            {
              id: "preview",
              name: "Preview",
              command: "bun dev",
              icon: "play",
              kind: "preview",
            },
          ],
        },
        {
          projectId: "legacy",
          scripts: [
            {
              id: "setup",
              name: "Setup",
              command: "bun install",
              icon: "configure",
              kind: "setup",
            },
            {
              id: "dev",
              name: "Dev",
              command: "bun dev",
              icon: "play",
              kind: "manual",
            },
          ],
        },
      ],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);
