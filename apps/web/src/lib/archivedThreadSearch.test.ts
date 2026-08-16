// FILE: archivedThreadSearch.test.ts
// Purpose: Title matching and archived-root visibility for archive search.
// Layer: Web search helper tests

import { describe, expect, it } from "vitest";

import {
  archivedThreadTitleMatchesQuery,
  collectArchivedThreadSearchRoots,
  filterArchivedGroupsByTitle,
} from "./archivedThreadSearch";

describe("collectArchivedThreadSearchRoots", () => {
  it("keeps archived roots and children whose parent is still active", () => {
    const roots = collectArchivedThreadSearchRoots([
      { id: "active-parent", archivedAt: null },
      {
        id: "recoverable-child",
        parentThreadId: "active-parent",
        archivedAt: "2026-01-02T00:00:00.000Z",
      },
      { id: "archived-parent", archivedAt: "2026-01-03T00:00:00.000Z" },
      {
        id: "represented-child",
        parentThreadId: "archived-parent",
        archivedAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    expect(roots.map((thread) => thread.id)).toEqual(["recoverable-child", "archived-parent"]);
  });
});

describe("archivedThreadTitleMatchesQuery", () => {
  it("matches a case-insensitive title substring", () => {
    expect(archivedThreadTitleMatchesQuery("Composer refactor", "composer")).toBe(true);
    expect(archivedThreadTitleMatchesQuery("Composer refactor", "settings")).toBe(false);
  });

  it("matches every query token against the title", () => {
    expect(archivedThreadTitleMatchesQuery("Composer refactor follow-up", "comp follow")).toBe(
      true,
    );
    expect(archivedThreadTitleMatchesQuery("Composer refactor", "comp missing")).toBe(false);
  });
});

describe("filterArchivedGroupsByTitle", () => {
  const groups = [
    {
      project: "Alpha",
      threads: [
        { id: "newer", title: "Newer archived" },
        { id: "older", title: "Older archived" },
      ],
    },
    {
      project: "Unknown",
      threads: [{ id: "orphan", title: "Orphan archived" }],
    },
  ];

  it("returns every group when the query is blank", () => {
    expect(filterArchivedGroupsByTitle(groups, "   ")).toEqual(groups);
  });

  it("hides groups that have no matching thread title", () => {
    const filtered = filterArchivedGroupsByTitle(groups, "newer");

    expect(filtered).toEqual([
      {
        project: "Alpha",
        threads: [{ id: "newer", title: "Newer archived" }],
      },
    ]);
  });
});
