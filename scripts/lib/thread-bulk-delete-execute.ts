import { randomUUID } from "node:crypto";

import { ORCHESTRATION_WS_METHODS, WS_METHODS } from "@luminor/contracts";

import { LuminorWsRpcClient, resolveLuminorAuthToken } from "./luminor-ws-rpc-client.ts";
import type { ThreadBulkDeletePlan } from "./thread-bulk-delete.ts";

export async function executeThreadBulkDelete(input: {
  readonly homeDir: string;
  readonly plan: ThreadBulkDeletePlan;
  readonly authToken?: string | undefined;
}): Promise<void> {
  if (input.plan.candidates.length === 0) {
    process.stdout.write("No threads to delete.\n");
    return;
  }

  const authToken = resolveLuminorAuthToken({
    homeDir: input.homeDir,
    explicitToken: input.authToken,
  });

  const client = await LuminorWsRpcClient.connect({
    homeDir: input.homeDir,
    authToken,
  });

  try {
    let deletedCount = 0;
    for (const candidate of input.plan.candidates) {
      await client.request<{ sequence: number }>(ORCHESTRATION_WS_METHODS.dispatchCommand, {
        type: "thread.delete",
        commandId: randomUUID(),
        threadId: candidate.threadId,
      });
      deletedCount += 1;
      process.stdout.write(`Deleted thread ${String(deletedCount)}/${String(input.plan.candidates.length)}: ${candidate.title}\n`);
    }

    let removedWorktreeCount = 0;
    for (const worktree of input.plan.worktreesToRemove) {
      await client.request<void>(WS_METHODS.gitRemoveWorktree, {
        cwd: worktree.projectCwd,
        path: worktree.path,
        force: true,
      });
      removedWorktreeCount += 1;
      process.stdout.write(
        `Removed worktree ${String(removedWorktreeCount)}/${String(input.plan.worktreesToRemove.length)}: ${worktree.path}\n`,
      );
    }

    process.stdout.write(
      `\nDone. Deleted ${String(deletedCount)} thread(s) and removed ${String(removedWorktreeCount)} worktree(s).\n`,
    );
  } finally {
    client.close();
  }
}
