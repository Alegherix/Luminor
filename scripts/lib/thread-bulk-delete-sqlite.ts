import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import {
  loadProjectionThreads,
  type LoadProjectionThreadsDatabase,
} from "./thread-bulk-delete.ts";

export function openProjectionThreadsDatabase(stateSqlitePath: string): {
  readonly database: LoadProjectionThreadsDatabase;
  readonly cleanup: () => void;
} {
  if (!existsSync(stateSqlitePath)) {
    throw new Error(`State database not found: ${stateSqlitePath}`);
  }

  let tempPath: string | null = null;
  let db: Database;
  try {
    db = new Database(stateSqlitePath, { readonly: true });
    db.query("SELECT 1").get();
  } catch {
    tempPath = join(tmpdir(), `luminor-bulk-delete-${randomUUID()}.sqlite`);
    copyFileSync(stateSqlitePath, tempPath);
    db = new Database(tempPath, { readonly: true });
  }

  const database: LoadProjectionThreadsDatabase = {
    query: <T>(sql: string) => db.query(sql).all() as ReadonlyArray<T>,
    close: () => db.close(),
  };

  return {
    database,
    cleanup: () => {
      database.close();
      if (tempPath) {
        unlinkSync(tempPath);
      }
    },
  };
}

export function loadProjectionThreadsFromStateSqlite(
  stateSqlitePath: string,
): {
  readonly threads: ReturnType<typeof loadProjectionThreads>;
  readonly cleanup: () => void;
} {
  const { database, cleanup } = openProjectionThreadsDatabase(stateSqlitePath);
  const threads = loadProjectionThreads(database);
  database.close();
  return { threads, cleanup };
}
