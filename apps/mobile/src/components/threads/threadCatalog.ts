import type { ThreadStatusKind } from "../../state/threadStatus";

export type ThreadFilter = "all" | "active" | "pinned";

export type CatalogThread = {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: ThreadStatusKind;
  readonly unread: boolean;
  readonly isPinned?: boolean | undefined;
  readonly archivedAt?: string | null | undefined;
  readonly updatedAt: string;
  readonly createdAt: string;
  readonly latestTurn: {
    readonly completedAt: string | null;
    readonly startedAt: string | null;
  } | null;
};

export type CatalogProject = {
  readonly id: string;
  readonly title: string;
  readonly spaceId?: string | null | undefined;
};

export type CatalogSpace = {
  readonly id: string;
  readonly name: string;
};

export type CatalogLabels = {
  readonly unfiled: string;
  readonly now: string;
  readonly minutesAgo: string;
  readonly hoursAgo: string;
  readonly daysAgo: string;
};

export type CatalogRow = {
  readonly threadId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: ThreadStatusKind;
  readonly timeLabel: string;
  readonly unreadCount: number;
};

export type CatalogGroup = {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly CatalogRow[];
};

export type ThreadFilterCounts = {
  readonly all: number;
  readonly active: number;
  readonly pinned: number;
};

export type ConnectionViewStatus = "connecting" | "open" | "closed" | "incompatible";

export type CatalogViewState = "disconnected" | "incompatible" | "loading" | "ready";

export function catalogViewState(
  status: ConnectionViewStatus,
  hydrated: boolean,
): CatalogViewState {
  if (status === "incompatible") return "incompatible";
  if (status === "connecting") return "loading";
  if (status !== "open") return "disconnected";
  if (!hydrated) return "loading";
  return "ready";
}

const UNFILED_KEY = "__unfiled";

export function isArchivedThread(thread: Pick<CatalogThread, "archivedAt">): boolean {
  return thread.archivedAt != null && thread.archivedAt.length > 0;
}

export function isPinnedThread(thread: Pick<CatalogThread, "isPinned">): boolean {
  return thread.isPinned === true;
}

export function isLiveThread(thread: Pick<CatalogThread, "status">): boolean {
  return thread.status !== "idle";
}

export function visibleCatalogThreads(
  threads: readonly CatalogThread[],
  filter: ThreadFilter,
): CatalogThread[] {
  return threads.filter((thread) => {
    if (isArchivedThread(thread)) return false;
    if (filter === "active") return isLiveThread(thread);
    if (filter === "pinned") return isPinnedThread(thread);
    return true;
  });
}

export function countThreadFilters(threads: readonly CatalogThread[]): ThreadFilterCounts {
  let all = 0;
  let active = 0;
  let pinned = 0;
  for (const thread of threads) {
    if (isArchivedThread(thread)) continue;
    all += 1;
    if (isLiveThread(thread)) active += 1;
    if (isPinnedThread(thread)) pinned += 1;
  }
  return { all, active, pinned };
}

export function normalizeSearchQuery(query: string): string {
  return query.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

export function threadMatchesQuery(haystack: string, query: string): boolean {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return false;
  const normalizedHaystack = haystack.toLowerCase();
  if (normalizedHaystack.includes(normalizedQuery)) return true;
  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 0);
  return tokens.length > 1 && tokens.every((token) => normalizedHaystack.includes(token));
}

export function threadRecencyIso(thread: CatalogThread): string {
  return thread.latestTurn?.completedAt ?? thread.latestTurn?.startedAt ?? thread.updatedAt;
}

export function formatRelativeTime(iso: string, nowMs: number, labels: CatalogLabels): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const deltaMs = Math.max(0, nowMs - then);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return labels.now;
  if (minutes < 60) return applyCount(labels.minutesAgo, minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return applyCount(labels.hoursAgo, hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return applyCount(labels.daysAgo, days);
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function buildThreadSubtitle(
  thread: Pick<CatalogThread, "projectId">,
  projects: ReadonlyMap<string, CatalogProject>,
  spaces: ReadonlyMap<string, CatalogSpace>,
  unfiled: string,
): string {
  const project = projects.get(thread.projectId);
  if (!project) return unfiled;
  const space = project.spaceId ? spaces.get(project.spaceId) : undefined;
  return space ? `${space.name} • ${project.title}` : project.title;
}

export function presentCatalogRow(
  thread: CatalogThread,
  projects: ReadonlyMap<string, CatalogProject>,
  spaces: ReadonlyMap<string, CatalogSpace>,
  nowMs: number,
  labels: CatalogLabels,
): CatalogRow {
  return {
    threadId: thread.id,
    title: thread.title,
    subtitle: buildThreadSubtitle(thread, projects, spaces, labels.unfiled),
    status: thread.status,
    timeLabel: formatRelativeTime(threadRecencyIso(thread), nowMs, labels),
    unreadCount: thread.unread ? 1 : 0,
  };
}

export function buildThreadGroups(input: {
  readonly threads: readonly CatalogThread[];
  readonly projects: readonly CatalogProject[];
  readonly spaces: readonly CatalogSpace[];
  readonly filter: ThreadFilter;
  readonly nowMs: number;
  readonly labels: CatalogLabels;
}): CatalogGroup[] {
  const projects = indexById(input.projects);
  const spaces = indexById(input.spaces);
  const grouped = new Map<
    string,
    { title: string; recency: number; rows: Array<CatalogRow & { recency: number }> }
  >();

  for (const thread of visibleCatalogThreads(input.threads, input.filter)) {
    const project = projects.get(thread.projectId);
    const key = project ? project.id : UNFILED_KEY;
    const title = project?.title ?? input.labels.unfiled;
    const row = presentCatalogRow(thread, projects, spaces, input.nowMs, input.labels);
    const recency = Date.parse(threadRecencyIso(thread));
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.rows.push({ ...row, recency });
      if (Number.isFinite(recency) && recency > bucket.recency) bucket.recency = recency;
    } else {
      grouped.set(key, {
        title,
        recency: Number.isFinite(recency) ? recency : 0,
        rows: [{ ...row, recency }],
      });
    }
  }

  return [...grouped.entries()]
    .toSorted((left, right) => {
      const leftUnfiled = left[0] === UNFILED_KEY ? 1 : 0;
      const rightUnfiled = right[0] === UNFILED_KEY ? 1 : 0;
      if (leftUnfiled !== rightUnfiled) return leftUnfiled - rightUnfiled;
      if (left[1].recency !== right[1].recency) return right[1].recency - left[1].recency;
      return left[1].title.localeCompare(right[1].title);
    })
    .map(([key, group]) => ({
      key,
      title: group.title,
      rows: group.rows
        .toSorted((left, right) => right.recency - left.recency)
        .map(({ recency: _recency, ...row }) => row),
    }));
}

export function searchCatalogThreads(input: {
  readonly threads: readonly CatalogThread[];
  readonly projects: readonly CatalogProject[];
  readonly spaces: readonly CatalogSpace[];
  readonly query: string;
  readonly nowMs: number;
  readonly labels: CatalogLabels;
}): CatalogRow[] {
  const query = normalizeSearchQuery(input.query);
  if (!query) return [];
  const projects = indexById(input.projects);
  const spaces = indexById(input.spaces);
  return input.threads
    .flatMap((thread) => {
      const row = presentCatalogRow(thread, projects, spaces, input.nowMs, input.labels);
      const haystack = `${row.title} ${row.subtitle}`;
      return threadMatchesQuery(haystack, query)
        ? [{ row, recency: Date.parse(threadRecencyIso(thread)) }]
        : [];
    })
    .toSorted((left, right) => right.recency - left.recency)
    .map(({ row }) => row);
}

function applyCount(template: string, n: number): string {
  return template.replaceAll("{n}", String(n));
}

function indexById<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}
