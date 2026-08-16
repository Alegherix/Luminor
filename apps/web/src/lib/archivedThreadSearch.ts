// FILE: archivedThreadSearch.ts
// Purpose: Title search and archived-root visibility shared by Settings → Archived
//          and the sidebar search palette.
// Layer: Web search helper
// Exports: collectArchivedThreadSearchRoots, archivedThreadTitleMatchesQuery,
//          filterArchivedGroupsByTitle

export type ArchivedSearchThread = {
  id: string;
  archivedAt?: string | null | undefined;
  parentThreadId?: string | null | undefined;
};

function normalizeArchivedSearchText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

export function collectArchivedThreadSearchRoots<T extends ArchivedSearchThread>(
  threads: readonly T[],
): T[] {
  const archivedThreadIds = new Set(
    threads.filter((thread) => thread.archivedAt != null).map((thread) => thread.id),
  );
  return threads.filter((thread) => {
    if (thread.archivedAt == null) return false;
    const parentThreadId = thread.parentThreadId ?? null;
    return parentThreadId === null || !archivedThreadIds.has(parentThreadId);
  });
}

export function archivedThreadTitleMatchesQuery(title: string, query: string): boolean {
  const normalizedQuery = normalizeArchivedSearchText(query);
  if (!normalizedQuery) return true;

  const normalizedTitle = normalizeArchivedSearchText(title);
  if (normalizedTitle.includes(normalizedQuery)) return true;

  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 0);
  return tokens.length > 1 && tokens.every((token) => normalizedTitle.includes(token));
}

export function filterArchivedGroupsByTitle<
  TThread extends { title: string },
  TGroup extends { threads: readonly TThread[] },
>(groups: readonly TGroup[], query: string): TGroup[] {
  if (!normalizeArchivedSearchText(query)) {
    return [...groups];
  }

  return groups.flatMap((group) => {
    const threads = group.threads.filter((thread) =>
      archivedThreadTitleMatchesQuery(thread.title, query),
    );
    return threads.length === 0 ? [] : [{ ...group, threads }];
  });
}
