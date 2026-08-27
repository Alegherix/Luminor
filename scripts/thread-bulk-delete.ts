#!/usr/bin/env bun

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseThreadBulkDeleteArgs,
  threadBulkDeleteUsage,
} from "./lib/thread-bulk-delete-args.ts";
import {
  buildThreadBulkDeletePlan,
  formatThreadBulkDeletePlan,
  loadProjectionThreads,
  resolveThreadBulkDeletePaths,
} from "./lib/thread-bulk-delete.ts";
import { openProjectionThreadsDatabase } from "./lib/thread-bulk-delete-sqlite.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  let args;
  try {
    args = parseThreadBulkDeleteArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof Error && error.message === "HELP") {
      process.stdout.write(threadBulkDeleteUsage());
      return;
    }
    throw error;
  }

  const paths = resolveThreadBulkDeletePaths({
    repoRoot: REPO_ROOT,
    homeDir: args.homeDir,
    stateSqlitePath: args.stateSqlitePath,
  });

  const { database, cleanup } = openProjectionThreadsDatabase(paths.stateSqlitePath);
  try {
    const plan = buildThreadBulkDeletePlan(loadProjectionThreads(database), args.selector);
    process.stdout.write(`${formatThreadBulkDeletePlan(plan, { dryRun: args.dryRun })}\n`);

    if (args.dryRun) {
      process.stdout.write("\nDry-run only. Re-run with --execute to delete.\n");
      return;
    }

    const { executeThreadBulkDelete } = await import("./lib/thread-bulk-delete-execute.ts");
    await executeThreadBulkDelete({
      repoRoot: REPO_ROOT,
      homeDir: paths.homeDir,
      plan,
    });
  } finally {
    cleanup();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`thread-bulk-delete failed: ${message}\n`);
    process.exit(1);
  });
}
