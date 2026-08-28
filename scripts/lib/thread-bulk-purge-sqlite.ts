import { Database } from "bun:sqlite";

export interface ThreadBulkPurgeSelector {
  readonly workspaceRoots: ReadonlyArray<string>;
  readonly projectTitles: ReadonlyArray<string>;
  readonly threadIds: ReadonlyArray<string>;
}

export interface ThreadBulkPurgeCounts {
  readonly threads: number;
  readonly orchestrationEvents: number;
  readonly threadActivities: number;
  readonly commandReceipts: number;
  readonly threadMessages: number;
}

export interface ThreadBulkPurgePlan {
  readonly selector: ThreadBulkPurgeSelector;
  readonly threadIds: ReadonlyArray<string>;
  readonly counts: ThreadBulkPurgeCounts;
}

const TARGET_THREADS_CTE = `
  WITH target_threads(thread_id) AS (
    SELECT t.thread_id
    FROM projection_threads t
    JOIN projection_projects p ON p.project_id = t.project_id
    WHERE t.deleted_at IS NULL
      AND (
        (json_array_length(?) > 0 AND p.workspace_root IN (SELECT value FROM json_each(?)))
        OR (json_array_length(?) > 0 AND p.title IN (SELECT value FROM json_each(?)))
        OR (json_array_length(?) > 0 AND t.thread_id IN (SELECT value FROM json_each(?)))
      )
  )
`;

function selectorJson(values: ReadonlyArray<string>): string {
  return JSON.stringify(values);
}

function hasSelector(selector: ThreadBulkPurgeSelector): boolean {
  return (
    selector.workspaceRoots.length > 0 ||
    selector.projectTitles.length > 0 ||
    selector.threadIds.length > 0
  );
}

export function buildThreadBulkPurgePlan(
  database: Database,
  selector: ThreadBulkPurgeSelector,
): ThreadBulkPurgePlan {
  if (!hasSelector(selector)) {
    throw new Error("At least one selector is required.");
  }

  const workspaceRootsJson = selectorJson(selector.workspaceRoots);
  const projectTitlesJson = selectorJson(selector.projectTitles);
  const threadIdsJson = selectorJson(selector.threadIds);

  const threadIds = database
    .query(
      `${TARGET_THREADS_CTE}
       SELECT thread_id FROM target_threads ORDER BY thread_id ASC`,
    )
    .all(
      workspaceRootsJson,
      workspaceRootsJson,
      projectTitlesJson,
      projectTitlesJson,
      threadIdsJson,
      threadIdsJson,
    ) as ReadonlyArray<{ thread_id: string }>;

  const counts = database
    .query(
      `${TARGET_THREADS_CTE}
       SELECT
         (SELECT COUNT(*) FROM target_threads) AS threads,
         (SELECT COUNT(*) FROM orchestration_events e
            WHERE e.aggregate_kind = 'thread'
              AND (
                e.stream_id IN (SELECT thread_id FROM target_threads)
                OR json_extract(e.payload_json, '$.threadId') IN (SELECT thread_id FROM target_threads)
              )
         ) AS orchestrationEvents,
         (SELECT COUNT(*) FROM projection_thread_activities a
            WHERE a.thread_id IN (SELECT thread_id FROM target_threads)
         ) AS threadActivities,
         (SELECT COUNT(*) FROM orchestration_command_receipts r
            WHERE r.aggregate_kind = 'thread'
              AND r.aggregate_id IN (SELECT thread_id FROM target_threads)
         ) AS commandReceipts,
         (SELECT COUNT(*) FROM projection_thread_messages m
            WHERE m.thread_id IN (SELECT thread_id FROM target_threads)
         ) AS threadMessages`,
    )
    .get(
      workspaceRootsJson,
      workspaceRootsJson,
      projectTitlesJson,
      projectTitlesJson,
      threadIdsJson,
      threadIdsJson,
    ) as ThreadBulkPurgeCounts;

  return {
    selector,
    threadIds: threadIds.map((row) => row.thread_id),
    counts,
  };
}

export function formatThreadBulkPurgePlan(
  plan: ThreadBulkPurgePlan,
  options: { readonly dryRun: boolean },
): string {
  const lines = [
    options.dryRun ? "Thread bulk purge dry-run" : "Thread bulk purge execution",
    `Threads matched: ${String(plan.threadIds.length)}`,
    `Orchestration events: ${String(plan.counts.orchestrationEvents)}`,
    `Thread activities: ${String(plan.counts.threadActivities)}`,
    `Command receipts: ${String(plan.counts.commandReceipts)}`,
    `Thread messages: ${String(plan.counts.threadMessages)}`,
  ];
  if (plan.selector.workspaceRoots.length > 0) {
    lines.push(`Workspace roots: ${plan.selector.workspaceRoots.join(", ")}`);
  }
  if (plan.selector.projectTitles.length > 0) {
    lines.push(`Project titles: ${plan.selector.projectTitles.join(", ")}`);
  }
  return lines.join("\n");
}

export function executeThreadBulkPurge(
  database: Database,
  selector: ThreadBulkPurgeSelector,
): ThreadBulkPurgePlan {
  const plan = buildThreadBulkPurgePlan(database, selector);
  if (plan.threadIds.length === 0) {
    return plan;
  }

  const workspaceRootsJson = selectorJson(selector.workspaceRoots);
  const projectTitlesJson = selectorJson(selector.projectTitles);
  const threadIdsJson = selectorJson(selector.threadIds);
  const deletedAt = new Date().toISOString();
  const threadDeletedAutomationRunResultJson = JSON.stringify({
    kind: "thread-deleted",
  });

  const run = (sql: string, ...params: ReadonlyArray<unknown>) => {
    database.query(sql).run(...params);
  };
  const cteParams = [
    workspaceRootsJson,
    workspaceRootsJson,
    projectTitlesJson,
    projectTitlesJson,
    threadIdsJson,
    threadIdsJson,
  ] as const;

  database.exec("BEGIN IMMEDIATE");
  try {
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM orchestration_event_deliveries
       WHERE thread_id IN (SELECT thread_id FROM target_threads)
         AND state = 'succeeded'`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM queued_turn_promotions
       WHERE thread_id IN (SELECT thread_id FROM target_threads)
         AND state IN ('promoted', 'cancelled')`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       UPDATE external_mcp_tasks
       SET status = 'failed', updated_at = ?
       WHERE thread_id IN (SELECT thread_id FROM target_threads)
         AND status IN ('planned', 'created')`,
      ...cteParams,
      deletedAt,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM agent_gateway_operations
       WHERE caller_thread_id IN (SELECT thread_id FROM target_threads)
         AND status IN ('reserved', 'completed', 'failed')`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM orchestration_events
       WHERE aggregate_kind = 'thread'
         AND (
           stream_id IN (SELECT thread_id FROM target_threads)
           OR json_extract(payload_json, '$.threadId') IN (SELECT thread_id FROM target_threads)
         )`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM orchestration_command_receipts
       WHERE aggregate_kind = 'thread'
         AND aggregate_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM provider_runtime_events
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM provider_runtime_open_turns
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM git_handoff_operations
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM managed_attachment_blobs
       WHERE owner_thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM checkpoint_diff_blobs
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM provider_session_runtime
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM projection_pending_interactions
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM projection_thread_activities
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM projection_thread_messages
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM message_text_segments
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM projection_thread_proposed_plans
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM projection_thread_sessions
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM projection_turns
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    run(
      `${TARGET_THREADS_CTE}
       UPDATE automation_runs
       SET status = 'interrupted',
           error = 'Automation run was interrupted because its thread was deleted.',
           result_json = ?,
           finished_at = COALESCE(finished_at, ?),
           updated_at = ?,
           lease_expires_at = NULL,
           claimed_by = NULL
       WHERE thread_id IN (SELECT thread_id FROM target_threads)
         AND status NOT IN ('succeeded', 'failed', 'cancelled', 'interrupted', 'skipped')`,
      ...cteParams,
      threadDeletedAutomationRunResultJson,
      deletedAt,
      deletedAt,
    );
    run(
      `${TARGET_THREADS_CTE}
       DELETE FROM projection_threads
       WHERE thread_id IN (SELECT thread_id FROM target_threads)`,
      ...cteParams,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return plan;
}

export function vacuumStateDatabase(database: Database): void {
  database.exec("VACUUM");
}

export function readDatabaseSizeBytes(database: Database): number {
  const row = database
    .query("SELECT page_count * page_size AS sizeBytes FROM pragma_page_count(), pragma_page_size()")
    .get() as { sizeBytes: number };
  return row.sizeBytes;
}
