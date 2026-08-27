import {
  DEFAULT_THREAD_BULK_DELETE_SELECTOR,
  type ThreadBulkDeleteSelector,
} from "./thread-bulk-delete.ts";

export interface ParsedThreadBulkDeleteArgs {
  readonly dryRun: boolean;
  readonly homeDir: string | undefined;
  readonly stateSqlitePath: string | undefined;
  readonly selector: ThreadBulkDeleteSelector;
}

export function parseThreadBulkDeleteArgs(argv: ReadonlyArray<string>): ParsedThreadBulkDeleteArgs {
  let dryRun = true;
  let homeDir: string | undefined;
  let stateSqlitePath: string | undefined;
  const folders: string[] = [];
  const titles: string[] = [];
  const titleLikes: string[] = [];
  const threadIds: string[] = [];
  let useDefaultSelector = true;

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
    if (argument === "--home-dir") {
      homeDir = argv[index + 1]?.trim();
      if (!homeDir) throw new Error("Missing value for --home-dir.");
      index += 1;
      continue;
    }
    if (argument === "--state-sqlite") {
      stateSqlitePath = argv[index + 1]?.trim();
      if (!stateSqlitePath) throw new Error("Missing value for --state-sqlite.");
      index += 1;
      continue;
    }
    if (argument === "--folder") {
      useDefaultSelector = false;
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("Missing value for --folder.");
      folders.push(value);
      index += 1;
      continue;
    }
    if (argument === "--title") {
      useDefaultSelector = false;
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("Missing value for --title.");
      titles.push(value);
      index += 1;
      continue;
    }
    if (argument === "--title-like") {
      useDefaultSelector = false;
      const value = argv[index + 1]?.trim();
      if (!value) throw new Error("Missing value for --title-like.");
      titleLikes.push(value);
      index += 1;
      continue;
    }
    if (argument === "--thread-id") {
      useDefaultSelector = false;
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

  const selector: ThreadBulkDeleteSelector = useDefaultSelector
    ? DEFAULT_THREAD_BULK_DELETE_SELECTOR
    : {
        folders,
        titles,
        titleLikes,
        threadIds,
      };

  return {
    dryRun,
    homeDir,
    stateSqlitePath,
    selector,
  };
}

export function threadBulkDeleteUsage(): string {
  return `Usage: bun run thread-bulk-delete [--dry-run | --execute] [options]

Defaults (when no selector flags are passed):
  --folder "Crashes"
  --folder "PR parity gap (right-view open)"
  --title "New thread"

Options:
  --dry-run           Preview matched threads without deleting (default)
  --execute           Delete matched threads via the running Luminor server
  --home-dir <path>   Luminor home directory (default: ./.luminor/electron-dev)
  --state-sqlite <p>  Override state.sqlite path for dry-run inspection
  --folder <name>     Match threads in a folder (repeatable)
  --title <title>     Match exact thread title (repeatable)
  --title-like <pat>  Match title pattern (* and ? wildcards)
  --thread-id <id>    Match a specific thread id (repeatable)
`;
}
