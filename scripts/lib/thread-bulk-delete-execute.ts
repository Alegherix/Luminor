import type { ThreadBulkDeletePlan } from "./thread-bulk-delete.ts";

export async function executeThreadBulkDelete(_input: {
  readonly repoRoot: string;
  readonly homeDir: string;
  readonly plan: ThreadBulkDeletePlan;
}): Promise<void> {
  throw new Error(
    "Execute mode is not wired yet. Dry-run is available now; server-side delete will land in a follow-up.",
  );
}
