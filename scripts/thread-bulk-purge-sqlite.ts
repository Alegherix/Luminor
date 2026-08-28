#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";

import {
  buildThreadBulkPurgePlan,
  executeThreadBulkPurge,
  formatThreadBulkPurgePlan,
  readDatabaseSizeBytes,
  vacuumStateDatabase,
  type ThreadBulkPurgeSelector,
} from "./lib/thread-bulk-purge-sqlite.ts";

interface ParsedArgs {
  readonly dryRun: boolean;
  readonly vacuum: boolean;
  readonly stateSqlitePath: string;
  readonly selector: ThreadBulkPurgeSelector;
}

function usage(): string {
  return `Usage: bun run thread-bulk-purge-sqlite [--dry-run | --execute] [options]

Offline hard purge for threads in a Luminor state.sqlite database.
Use this for GPUI / rust-core homes where thread.delete only soft-deletes.

Options:
  --dry-run                 Preview matched rows (default)
  --execute                 Purge matched threads from SQLite
  --vacuum                  Run VACUUM after --execute (requires no other DB handles)
  --state-sqlite <path>     Path to state.sqlite (required)
  --workspace-root <path>   Match threads in a project workspace (repeatable)
  --project-title <title>   Match threads by project title (repeatable)
  --thread-id <id>          Match a specific thread id (repeatable)
`;
}

function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  let dryRun = true;
  let vacuum = false;
  let stateSqlitePath: string | undefined;
  const workspaceRoots: string[] = [];
  const projectTitles: string[] = [];
  const threadIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--execute") {
      dryRun = false;
      continue;
    }
    if (argument === "--vacuum") {
      vacuum = true;
      continue;
    }
    if (argument === "--state-sqlite") {
      stateSqlitePath = argv[index + 1]?.trim();
      if (!stateSqlitePath) throw new Error("Missing value for --state-sqlite.");
      index += 1;
      continue;
    }
    if (argument === "--workspace-root") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("Missing value for --workspace-root.");
      workspaceRoots.push(value);
      index += 1;
      continue;
    }
    if (argument === "--project-title") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("Missing value for --project-title.");
      projectTitles.push(value);
      index += 1;
      continue;
    }
    if (argument === "--thread-id") {
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("Missing value for --thread-id.");
      threadIds.push(value);
      index += 1;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      throw new Error("HELP");
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!stateSqlitePath) {
    throw new Error("Missing required --state-sqlite <path>.");
  }

  return {
    dryRun,
    vacuum,
    stateSqlitePath: resolve(stateSqlitePath),
    selector: {
      workspaceRoots,
      projectTitles,
      threadIds,
    },
  };
}

function formatBytes(bytes: number): string {
  const gib = bytes / 1024 / 1024 / 1024;
  return `${gib.toFixed(2)} GiB`;
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof Error && error.message === "HELP") {
      process.stdout.write(usage());
      return;
    }
    throw error;
  }

  if (!existsSync(args.stateSqlitePath)) {
    throw new Error(`State database not found: ${args.stateSqlitePath}`);
  }
  if (args.vacuum && args.dryRun) {
    throw new Error("--vacuum requires --execute.");
  }

  const database = new Database(args.stateSqlitePath);
  try {
    const sizeBefore = readDatabaseSizeBytes(database);
    const plan = buildThreadBulkPurgePlan(database, args.selector);
    process.stdout.write(`${formatThreadBulkPurgePlan(plan, { dryRun: args.dryRun })}\n`);
    process.stdout.write(`Database size before: ${formatBytes(sizeBefore)}\n`);

    if (args.dryRun) {
      process.stdout.write("\nDry-run only. Re-run with --execute to purge.\n");
      return;
    }

    executeThreadBulkPurge(database, args.selector);
    const sizeAfterPurge = readDatabaseSizeBytes(database);
    process.stdout.write(
      `\nPurged ${String(plan.threadIds.length)} thread(s). Database logical size: ${formatBytes(sizeAfterPurge)}\n`,
    );

    if (!args.vacuum) {
      process.stdout.write("Re-run with --vacuum to reclaim disk space.\n");
      return;
    }

    process.stdout.write("Running VACUUM...\n");
    vacuumStateDatabase(database);
    const sizeAfterVacuum = readDatabaseSizeBytes(database);
    process.stdout.write(
      `VACUUM complete. Database size after: ${formatBytes(sizeAfterVacuum)} (saved ${formatBytes(sizeBefore - sizeAfterVacuum)})\n`,
    );
  } finally {
    database.close();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`thread-bulk-purge-sqlite failed: ${message}\n`);
    process.exit(1);
  });
}
