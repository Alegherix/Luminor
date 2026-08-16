import { describe, expect, it } from "vitest";

import type { CatalogLabels, CatalogThread } from "./threadCatalog";
import {
  buildThreadGroups,
  countThreadFilters,
  formatRelativeTime,
  searchCatalogThreads,
  threadMatchesQuery,
  visibleCatalogThreads,
} from "./threadCatalog";

const labels: CatalogLabels = {
  unfiled: "Unfiled",
  now: "now",
  minutesAgo: "{n}m ago",
  hoursAgo: "{n}h ago",
  daysAgo: "{n}d ago",
};

const nowMs = Date.parse("2026-08-16T12:00:00.000Z");

function thread(overrides: Partial<CatalogThread> & Pick<CatalogThread, "id">): CatalogThread {
  return {
    projectId: "proj-luminor",
    title: "Review auth",
    status: "idle",
    unread: false,
    updatedAt: "2026-08-16T11:50:00.000Z",
    createdAt: "2026-08-16T10:00:00.000Z",
    latestTurn: { completedAt: "2026-08-16T11:50:00.000Z", startedAt: "2026-08-16T11:40:00.000Z" },
    ...overrides,
  };
}

describe("visibleCatalogThreads", () => {
  const threads = [
    thread({ id: "idle", status: "idle" }),
    thread({ id: "active", status: "active" }),
    thread({ id: "running", status: "running" }),
    thread({ id: "attention", status: "needs-attention", isPinned: true }),
    thread({ id: "pinned-idle", status: "idle", isPinned: true }),
    thread({ id: "archived", status: "active", isPinned: true, archivedAt: "2026-08-15T00:00:00.000Z" }),
  ];

  it("hides archived threads from every filter", () => {
    expect(visibleCatalogThreads(threads, "all").map((item) => item.id)).toEqual([
      "idle",
      "active",
      "running",
      "attention",
      "pinned-idle",
    ]);
  });

  it("treats running and needs-attention as active work", () => {
    expect(visibleCatalogThreads(threads, "active").map((item) => item.id)).toEqual([
      "active",
      "running",
      "attention",
    ]);
  });

  it("keeps only pinned live threads", () => {
    expect(visibleCatalogThreads(threads, "pinned").map((item) => item.id)).toEqual([
      "attention",
      "pinned-idle",
    ]);
  });
});

describe("countThreadFilters", () => {
  it("counts non-archived threads per filter", () => {
    expect(
      countThreadFilters([
        thread({ id: "a", status: "active", isPinned: true }),
        thread({ id: "b", status: "idle" }),
        thread({ id: "c", status: "running", archivedAt: "2026-08-15T00:00:00.000Z" }),
      ]),
    ).toEqual({ all: 2, active: 1, pinned: 1 });
  });
});

describe("threadMatchesQuery", () => {
  it("matches the full phrase or every token", () => {
    expect(threadMatchesQuery("Personal • Luminor Review auth", "review")).toBe(true);
    expect(threadMatchesQuery("Personal • Luminor Review auth", "personal auth")).toBe(true);
    expect(threadMatchesQuery("Personal • Luminor Review auth", "missing")).toBe(false);
    expect(threadMatchesQuery("Personal • Luminor Review auth", "   ")).toBe(false);
  });
});

describe("formatRelativeTime", () => {
  it("formats compact relative labels", () => {
    expect(formatRelativeTime("2026-08-16T11:59:30.000Z", nowMs, labels)).toBe("now");
    expect(formatRelativeTime("2026-08-16T11:50:00.000Z", nowMs, labels)).toBe("10m ago");
    expect(formatRelativeTime("2026-08-16T09:00:00.000Z", nowMs, labels)).toBe("3h ago");
    expect(formatRelativeTime("2026-08-14T12:00:00.000Z", nowMs, labels)).toBe("2d ago");
    expect(formatRelativeTime("2026-08-01T12:00:00.000Z", nowMs, labels)).toBe("Aug 1");
    expect(formatRelativeTime("not-a-date", nowMs, labels)).toBe("");
  });
});

describe("buildThreadGroups", () => {
  it("groups by project, newest first, and parks missing projects last", () => {
    const groups = buildThreadGroups({
      threads: [
        thread({
          id: "older-luminor",
          title: "Older Luminor",
          updatedAt: "2026-08-16T09:00:00.000Z",
          latestTurn: { completedAt: "2026-08-16T09:00:00.000Z", startedAt: null },
        }),
        thread({
          id: "newer-luminor",
          title: "Newer Luminor",
          updatedAt: "2026-08-16T11:55:00.000Z",
          latestTurn: { completedAt: "2026-08-16T11:55:00.000Z", startedAt: null },
        }),
        thread({
          id: "kognic",
          projectId: "proj-kognic",
          title: "Frontend",
          updatedAt: "2026-08-16T11:00:00.000Z",
          latestTurn: { completedAt: "2026-08-16T11:00:00.000Z", startedAt: null },
        }),
        thread({
          id: "orphan",
          projectId: "missing",
          title: "Orphan",
          updatedAt: "2026-08-16T11:58:00.000Z",
          latestTurn: { completedAt: "2026-08-16T11:58:00.000Z", startedAt: null },
        }),
      ],
      projects: [
        { id: "proj-luminor", title: "Luminor", spaceId: "space-personal" },
        { id: "proj-kognic", title: "frontend", spaceId: "space-kognic" },
      ],
      spaces: [
        { id: "space-personal", name: "Personal" },
        { id: "space-kognic", name: "Kognic" },
      ],
      filter: "all",
      nowMs,
      labels,
    });

    expect(groups.map((group) => group.key)).toEqual(["proj-luminor", "proj-kognic", "__unfiled"]);
    expect(groups[0]?.rows.map((row) => row.threadId)).toEqual(["newer-luminor", "older-luminor"]);
    expect(groups[0]?.rows[0]).toMatchObject({
      title: "Newer Luminor",
      subtitle: "Personal • Luminor",
      timeLabel: "5m ago",
    });
    expect(groups[2]?.title).toBe("Unfiled");
  });
});

describe("searchCatalogThreads", () => {
  it("filters loaded threads including archived ones and ranks by recency", () => {
    const rows = searchCatalogThreads({
      threads: [
        thread({
          id: "auth",
          title: "Review auth",
          updatedAt: "2026-08-16T11:00:00.000Z",
          latestTurn: { completedAt: "2026-08-16T11:00:00.000Z", startedAt: null },
        }),
        thread({
          id: "archived-auth",
          title: "Old auth rewrite",
          archivedAt: "2026-08-10T00:00:00.000Z",
          updatedAt: "2026-08-16T11:40:00.000Z",
          latestTurn: { completedAt: "2026-08-16T11:40:00.000Z", startedAt: null },
        }),
        thread({
          id: "other",
          title: "Sessions polish",
          projectId: "proj-kognic",
        }),
      ],
      projects: [
        { id: "proj-luminor", title: "Luminor", spaceId: "space-personal" },
        { id: "proj-kognic", title: "frontend", spaceId: "space-kognic" },
      ],
      spaces: [
        { id: "space-personal", name: "Personal" },
        { id: "space-kognic", name: "Kognic" },
      ],
      query: "auth",
      nowMs,
      labels,
    });

    expect(rows.map((row) => row.threadId)).toEqual(["archived-auth", "auth"]);
  });

  it("returns nothing for a blank query", () => {
    expect(
      searchCatalogThreads({
        threads: [thread({ id: "auth" })],
        projects: [],
        spaces: [],
        query: "   ",
        nowMs,
        labels,
      }),
    ).toEqual([]);
  });

  it("matches space and project names", () => {
    const rows = searchCatalogThreads({
      threads: [thread({ id: "auth", title: "Review auth" })],
      projects: [{ id: "proj-luminor", title: "Luminor", spaceId: "space-personal" }],
      spaces: [{ id: "space-personal", name: "Personal" }],
      query: "personal luminor",
      nowMs,
      labels,
    });
    expect(rows.map((row) => row.threadId)).toEqual(["auth"]);
  });
});
