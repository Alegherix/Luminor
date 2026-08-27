import { join, resolve } from "node:path";

export interface ThreadBulkDeleteSelector {
  readonly folders: ReadonlyArray<string>;
  readonly titles: ReadonlyArray<string>;
  readonly titleLikes: ReadonlyArray<string>;
  readonly threadIds: ReadonlyArray<string>;
}

export const PR_PARITY_GAP_FOLDER = "PR parity gap (right-view open)";

/** Only threads in these folders may trigger managed worktree removal. */
export const WORKTREE_REMOVAL_FOLDERS: ReadonlySet<string> = new Set([PR_PARITY_GAP_FOLDER]);

export const DEFAULT_THREAD_BULK_DELETE_SELECTOR: ThreadBulkDeleteSelector = {
  folders: ["Crashes", PR_PARITY_GAP_FOLDER],
  titles: ["New thread"],
  titleLikes: [],
  threadIds: [],
};

export interface ProjectionThreadRow {
  readonly threadId: string;
  readonly title: string;
  readonly folderName: string | null;
  readonly worktreePath: string | null;
  readonly projectCwd: string;
}

export interface ThreadBulkDeleteCandidate {
  readonly threadId: string;
  readonly title: string;
  readonly folderName: string | null;
  readonly worktreePath: string | null;
  readonly projectCwd: string;
  readonly orphanedWorktreePath: string | null;
}

export interface WorktreeRemovalPlan {
  readonly path: string;
  readonly projectCwd: string;
  readonly threadIds: ReadonlyArray<string>;
}

export interface ThreadBulkDeletePlan {
  readonly candidates: ReadonlyArray<ThreadBulkDeleteCandidate>;
  readonly worktreesToRemove: ReadonlyArray<WorktreeRemovalPlan>;
  readonly activeThreadCount: number;
  readonly survivingThreadCount: number;
}

export interface ThreadBulkDeletePaths {
  readonly repoRoot: string;
  readonly homeDir: string;
  readonly stateSqlitePath: string;
}

export function resolveThreadBulkDeletePaths(input: {
  readonly repoRoot: string;
  readonly homeDir?: string | undefined;
  readonly stateSqlitePath?: string | undefined;
}): ThreadBulkDeletePaths {
  const homeDir = resolve(input.repoRoot, input.homeDir ?? ".luminor/electron-dev");
  const stateSqlitePath = input.stateSqlitePath
    ? resolve(input.stateSqlitePath)
    : join(homeDir, "dev", "state.sqlite");
  return {
    repoRoot: input.repoRoot,
    homeDir,
    stateSqlitePath,
  };
}

function normalizeWorktreePath(path: string | null | undefined): string | null {
  const trimmed = path?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function matchesTitleLike(title: string, pattern: string): boolean {
  const escaped = pattern.replace(/[\\%_]/g, (char) => `\\${char}`);
  const regex = new RegExp(
    `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`,
    "i",
  );
  return regex.test(title);
}

export function threadMatchesSelector(
  thread: ProjectionThreadRow,
  selector: ThreadBulkDeleteSelector,
): boolean {
  if (selector.threadIds.length > 0) {
    return selector.threadIds.includes(thread.threadId);
  }

  const folderMatch =
    selector.folders.length > 0 &&
    thread.folderName !== null &&
    selector.folders.includes(thread.folderName);
  const titleMatch =
    selector.titles.length > 0 && selector.titles.includes(thread.title);
  const titleLikeMatch =
    selector.titleLikes.length > 0 &&
    selector.titleLikes.some((pattern) => matchesTitleLike(thread.title, pattern));

  const hasFolderOrTitleSelector =
    selector.folders.length > 0 ||
    selector.titles.length > 0 ||
    selector.titleLikes.length > 0;
  if (!hasFolderOrTitleSelector) {
    return false;
  }

  return folderMatch || titleMatch || titleLikeMatch;
}

export function getOrphanedWorktreePathForDeletion(
  threads: ReadonlyArray<ProjectionThreadRow>,
  deletedThreadIds: ReadonlySet<string>,
  threadId: string,
): string | null {
  const targetThread = threads.find((thread) => thread.threadId === threadId);
  if (!targetThread) {
    return null;
  }
  if (
    targetThread.folderName === null ||
    !WORKTREE_REMOVAL_FOLDERS.has(targetThread.folderName)
  ) {
    return null;
  }

  const targetWorktreePath = normalizeWorktreePath(targetThread.worktreePath);
  if (!targetWorktreePath) {
    return null;
  }

  const survivingThreads = threads.filter((thread) => !deletedThreadIds.has(thread.threadId));
  const isShared = survivingThreads.some(
    (thread) => normalizeWorktreePath(thread.worktreePath) === targetWorktreePath,
  );
  return isShared ? null : targetWorktreePath;
}

export function buildThreadBulkDeletePlan(
  threads: ReadonlyArray<ProjectionThreadRow>,
  selector: ThreadBulkDeleteSelector,
): ThreadBulkDeletePlan {
  const activeThreads = threads;
  const candidates = activeThreads
    .filter((thread) => threadMatchesSelector(thread, selector))
    .map((thread) => {
      const deletedThreadIds = new Set(
        activeThreads
          .filter((candidate) => threadMatchesSelector(candidate, selector))
          .map((candidate) => candidate.threadId),
      );
      return {
        threadId: thread.threadId,
        title: thread.title,
        folderName: thread.folderName,
        worktreePath: thread.worktreePath,
        projectCwd: thread.projectCwd,
        orphanedWorktreePath: getOrphanedWorktreePathForDeletion(
          activeThreads,
          deletedThreadIds,
          thread.threadId,
        ),
      } satisfies ThreadBulkDeleteCandidate;
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  const deletedThreadIds = new Set(candidates.map((candidate) => candidate.threadId));
  const worktreeMap = new Map<string, WorktreeRemovalPlan>();
  for (const candidate of candidates) {
    const orphanedWorktreePath = getOrphanedWorktreePathForDeletion(
      activeThreads,
      deletedThreadIds,
      candidate.threadId,
    );
    if (!orphanedWorktreePath) {
      continue;
    }
    const existing = worktreeMap.get(orphanedWorktreePath);
    if (existing) {
      worktreeMap.set(orphanedWorktreePath, {
        ...existing,
        threadIds: [...existing.threadIds, candidate.threadId],
      });
      continue;
    }
    worktreeMap.set(orphanedWorktreePath, {
      path: orphanedWorktreePath,
      projectCwd: candidate.projectCwd,
      threadIds: [candidate.threadId],
    });
  }

  return {
    candidates,
    worktreesToRemove: [...worktreeMap.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    activeThreadCount: activeThreads.length,
    survivingThreadCount: activeThreads.length - candidates.length,
  };
}

export interface LoadProjectionThreadsDatabase {
  readonly query: <T>(sql: string) => ReadonlyArray<T>;
  readonly close: () => void;
}

export function loadProjectionThreads(
  database: LoadProjectionThreadsDatabase,
): ReadonlyArray<ProjectionThreadRow> {
  return database
    .query<{
      thread_id: string;
      title: string;
      folder_name: string | null;
      worktree_path: string | null;
      project_cwd: string;
    }>(`
      SELECT
        t.thread_id,
        t.title,
        f.name AS folder_name,
        t.worktree_path,
        p.workspace_root AS project_cwd
      FROM projection_threads t
      JOIN projection_projects p ON p.project_id = t.project_id
      LEFT JOIN projection_folders f ON f.folder_id = t.folder_id
      WHERE t.deleted_at IS NULL
      ORDER BY t.title ASC
    `)
    .map((row) => ({
      threadId: row.thread_id,
      title: row.title,
      folderName: row.folder_name,
      worktreePath: row.worktree_path,
      projectCwd: row.project_cwd,
    }));
}

export function formatThreadBulkDeletePlan(
  plan: ThreadBulkDeletePlan,
  options: { readonly dryRun: boolean },
): string {
  const lines: string[] = [];
  lines.push(
    options.dryRun
      ? "Thread bulk delete dry-run"
      : "Thread bulk delete execution plan",
  );
  lines.push(
    `Threads matched: ${String(plan.candidates.length)} / ${String(plan.activeThreadCount)} active`,
  );
  lines.push(`Threads remaining after delete: ${String(plan.survivingThreadCount)}`);
  lines.push(
    `Worktrees to remove (PR parity gap only): ${String(plan.worktreesToRemove.length)}`,
  );
  lines.push("");

  if (plan.candidates.length === 0) {
    lines.push("No threads matched the selector.");
    return lines.join("\n");
  }

  lines.push("Threads:");
  for (const candidate of plan.candidates) {
    const folder = candidate.folderName ?? "(no folder)";
    const worktree = candidate.worktreePath
      ? `worktree=${candidate.worktreePath}`
      : "no worktree";
    const orphan = candidate.orphanedWorktreePath
      ? " -> remove worktree"
      : candidate.worktreePath
        ? " -> keep shared worktree"
        : "";
    lines.push(`- ${candidate.title}`);
    lines.push(`  id=${candidate.threadId}`);
    lines.push(`  folder=${folder}; ${worktree}${orphan}`);
  }

  if (plan.worktreesToRemove.length > 0) {
    lines.push("");
    lines.push("Worktrees:");
    for (const worktree of plan.worktreesToRemove) {
      lines.push(`- ${worktree.path}`);
      lines.push(`  project=${worktree.projectCwd}`);
      lines.push(`  threads=${worktree.threadIds.join(", ")}`);
    }
  }

  return lines.join("\n");
}
