// FILE: threadFolderMoves.ts
// Purpose: Single source for thread→folder membership moves (eligibility, batching, partial-failure reporting).
// Layer: Web client shared helper (sidebar context menus, folder drag-and-drop, group-into-new-folder)
// Exports: resolveFolderMoveScope, planFolderMove, buildFolderMoveMenuItems, parseFolderMoveMenuId,
//          moveThreadsToFolder, groupThreadsIntoNewFolder, describeFolderMoveOutcome

import type { FolderId, NativeApi, ProjectId, ThreadId } from "@luminor/contracts";
import { pluralize } from "@luminor/shared/text";

import { createFolder, moveThreadToFolder } from "./folders";

export type FolderMoveThread = {
  id: ThreadId;
  projectId: ProjectId;
  parentThreadId?: ThreadId | null | undefined;
  folderId?: FolderId | null | undefined;
};

export type FolderMoveScope = {
  projectId: ProjectId;
  /** Root threads eligible for a membership change, in input order. */
  threadIds: readonly ThreadId[];
  /** Current membership across the scope (`null` means unfiled), used to hide no-op targets. */
  folderIds: ReadonlySet<FolderId | null>;
  /** Rows that follow their root thread's membership instead of carrying their own. */
  skippedThreadIds: readonly ThreadId[];
};

export type FolderMovePlan = FolderMoveScope & {
  folderId: FolderId | null;
  /** Threads that need a dispatch; excludes rows already in the target. */
  pendingThreadIds: readonly ThreadId[];
};

export type FolderMoveFailure = { threadId: ThreadId; message: string };

export type FolderMoveOutcome = {
  movedThreadIds: readonly ThreadId[];
  failures: readonly FolderMoveFailure[];
};

export type FolderMoveReport = {
  type: "success" | "error";
  title: string;
  description?: string;
};

/**
 * Membership lives on root threads inside a single project, so a selection spanning
 * projects has no valid folder target and must not be partially applied.
 */
export function resolveFolderMoveScope(
  threads: readonly FolderMoveThread[],
): FolderMoveScope | null {
  const rootThreads = threads.filter((thread) => !thread.parentThreadId);
  const skippedThreadIds = threads
    .filter((thread) => Boolean(thread.parentThreadId))
    .map((thread) => thread.id);
  const firstRoot = rootThreads[0];
  if (!firstRoot) return null;
  if (rootThreads.some((thread) => thread.projectId !== firstRoot.projectId)) return null;

  return {
    projectId: firstRoot.projectId,
    threadIds: rootThreads.map((thread) => thread.id),
    folderIds: new Set(rootThreads.map((thread) => thread.folderId ?? null)),
    skippedThreadIds,
  };
}

export const FOLDER_MOVE_MENU_ID_PREFIX = "move-folder:";
const FOLDER_MOVE_MENU_NONE_TARGET = "none";
const FOLDER_MOVE_MENU_NEW_TARGET = "new";

export type FolderMoveMenuItem = {
  id: string;
  label: string;
  separatorBefore?: boolean;
};

export type FolderMoveMenuAction =
  | { kind: "folder"; folderId: FolderId }
  | { kind: "unfile" }
  | { kind: "new-folder" };

export function buildFolderMoveMenuItems(input: {
  scope: FolderMoveScope | null;
  folders: readonly { id: FolderId; name: string }[];
  /** Rows the action applies to; drives the `(n)` suffix used by batch menus. */
  count?: number;
}): FolderMoveMenuItem[] {
  const scope = input.scope;
  if (!scope) return [];
  const count = input.count ?? scope.threadIds.length;
  const suffix = count > 1 ? ` (${count})` : "";
  const isSettledTarget = (folderId: FolderId | null) =>
    scope.folderIds.size === 1 && scope.folderIds.has(folderId);

  const items: FolderMoveMenuItem[] = [];
  if (!isSettledTarget(null)) {
    items.push({
      id: `${FOLDER_MOVE_MENU_ID_PREFIX}${FOLDER_MOVE_MENU_NONE_TARGET}`,
      label: `Move out of folder${suffix}`,
    });
  }
  for (const folder of input.folders) {
    if (isSettledTarget(folder.id)) continue;
    items.push({
      id: `${FOLDER_MOVE_MENU_ID_PREFIX}${folder.id}`,
      label: `Move to “${folder.name}”${suffix}`,
    });
  }
  items.push({
    id: `${FOLDER_MOVE_MENU_ID_PREFIX}${FOLDER_MOVE_MENU_NEW_TARGET}`,
    label: `Group into new folder…${suffix}`,
  });

  const [first, ...rest] = items;
  return first ? [{ ...first, separatorBefore: true }, ...rest] : [];
}

export function parseFolderMoveMenuId(id: string): FolderMoveMenuAction | null {
  if (!id.startsWith(FOLDER_MOVE_MENU_ID_PREFIX)) return null;
  const target = id.slice(FOLDER_MOVE_MENU_ID_PREFIX.length);
  if (target === FOLDER_MOVE_MENU_NONE_TARGET) return { kind: "unfile" };
  if (target === FOLDER_MOVE_MENU_NEW_TARGET) return { kind: "new-folder" };
  if (target.length === 0) return null;
  return { kind: "folder", folderId: target as FolderId };
}

export function planFolderMove(input: {
  threads: readonly FolderMoveThread[];
  folderId: FolderId | null;
}): FolderMovePlan | null {
  const scope = resolveFolderMoveScope(input.threads);
  if (!scope) return null;
  const threadById = new Map(input.threads.map((thread) => [thread.id, thread] as const));
  return {
    ...scope,
    folderId: input.folderId,
    pendingThreadIds: scope.threadIds.filter(
      (threadId) => (threadById.get(threadId)?.folderId ?? null) !== input.folderId,
    ),
  };
}

export async function moveThreadsToFolder(input: {
  api: NativeApi;
  threadIds: readonly ThreadId[];
  folderId: FolderId | null;
}): Promise<FolderMoveOutcome> {
  const movedThreadIds: ThreadId[] = [];
  const failures: FolderMoveFailure[] = [];
  for (const threadId of input.threadIds) {
    try {
      await moveThreadToFolder({ api: input.api, threadId, folderId: input.folderId });
      movedThreadIds.push(threadId);
    } catch (error) {
      failures.push({
        threadId,
        message: error instanceof Error ? error.message : "Try again.",
      });
    }
  }
  return { movedThreadIds, failures };
}

export async function groupThreadsIntoNewFolder(input: {
  api: NativeApi;
  projectId: ProjectId;
  name: string;
  threadIds: readonly ThreadId[];
}): Promise<FolderMoveOutcome & { folderId: FolderId }> {
  const folderId = await createFolder({
    api: input.api,
    projectId: input.projectId,
    name: input.name,
  });
  const outcome = await moveThreadsToFolder({
    api: input.api,
    threadIds: input.threadIds,
    folderId,
  });
  return { ...outcome, folderId };
}

export function describeFolderMoveOutcome(input: {
  outcome: FolderMoveOutcome;
  folderName: string | null;
}): FolderMoveReport | null {
  const movedCount = input.outcome.movedThreadIds.length;
  const failureCount = input.outcome.failures.length;
  const destination = input.folderName === null ? "out of folders" : `to “${input.folderName}”`;
  const firstFailureMessage = input.outcome.failures[0]?.message ?? "Try again.";

  if (failureCount === 0) {
    // A fully applied single move reads from the sidebar itself; only batches need a receipt.
    if (movedCount <= 1) return null;
    return { type: "success", title: `Moved ${movedCount} threads ${destination}` };
  }

  if (movedCount === 0) {
    return {
      type: "error",
      title:
        failureCount === 1
          ? "Unable to move thread"
          : `Unable to move ${failureCount} ${pluralize(failureCount, "thread")}`,
      description: firstFailureMessage,
    };
  }

  return {
    type: "error",
    title: `Moved ${movedCount} of ${movedCount + failureCount} threads ${destination}`,
    description: `${failureCount} ${pluralize(failureCount, "thread")} could not be moved. ${firstFailureMessage}`,
  };
}
