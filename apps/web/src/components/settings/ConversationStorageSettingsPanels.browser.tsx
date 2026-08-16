// FILE: ConversationStorageSettingsPanels.browser.tsx
// Purpose: Browser characterization for worktree association and archived-thread grouping.
// Layer: Browser UI test

import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const harness = vi.hoisted(() => ({
  worktrees: [
    {
      workspaceRoot: "/repo",
      path: "/repo/.worktrees/feature",
    },
  ],
  threadShells: [] as Array<Record<string, unknown>>,
  projects: [{ id: "project-1", name: "Project One" }],
  removeDeletedThreadFromClientState: vi.fn(),
  mutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { worktrees: harness.worktrees }, isLoading: false, isError: false }),
  useMutation: () => ({ isPending: false, mutateAsync: harness.mutateAsync }),
  useQueryClient: () => ({ invalidateQueries: harness.invalidateQueries }),
}));

vi.mock("~/lib/serverReactQuery", () => ({
  serverQueryKeys: { worktrees: () => ["worktrees"] },
  serverWorktreesQueryOptions: () => ({ queryKey: ["worktrees"] }),
}));

vi.mock("~/lib/gitReactQuery", () => ({
  gitRemoveWorktreeMutationOptions: () => ({}),
}));

vi.mock("~/storeSelectors", () => ({
  createThreadShellsSelector: () => () => harness.threadShells,
}));

vi.mock("~/store", () => ({
  useStore: (selector: (store: Record<string, unknown>) => unknown) =>
    selector({
      projects: harness.projects,
      removeDeletedThreadFromClientState: harness.removeDeletedThreadFromClientState,
    }),
}));

import { ArchivedSettingsPanel, WorktreesSettingsPanel } from "./ConversationStorageSettingsPanels";

function thread(overrides: Record<string, unknown>) {
  return {
    id: "thread",
    title: "Thread",
    projectId: "project-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    worktreePath: null,
    associatedWorktreePath: null,
    ...overrides,
  };
}

describe("ConversationStorageSettingsPanels", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    harness.threadShells = [];
  });

  it("uses one association rule for direct and associated worktree paths", async () => {
    harness.threadShells = [
      thread({
        id: "direct",
        title: "Direct link",
        worktreePath: "/repo/.worktrees/feature",
      }),
      thread({
        id: "associated",
        title: "Associated link",
        associatedWorktreePath: "/repo/.worktrees/feature",
      }),
      thread({ id: "other", title: "Other worktree", worktreePath: "/repo/.worktrees/other" }),
    ];

    await render(<WorktreesSettingsPanel active />);

    expect(document.body.textContent).toContain("Direct link");
    expect(document.body.textContent).toContain("Associated link");
    expect(document.body.textContent).not.toContain("Other worktree");
  });

  it("sorts archived threads once and keeps orphaned projects visible", async () => {
    harness.threadShells = [
      thread({
        id: "older",
        title: "Older archived",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
      thread({
        id: "newer",
        title: "Newer archived",
        archivedAt: "2026-01-03T00:00:00.000Z",
      }),
      thread({
        id: "orphan",
        title: "Orphan archived",
        projectId: "missing-project",
        archivedAt: "2026-01-04T00:00:00.000Z",
      }),
    ];

    await render(<ArchivedSettingsPanel active />);

    const text = document.body.textContent ?? "";
    expect(text.indexOf("Newer archived")).toBeLessThan(text.indexOf("Older archived"));
    expect(text).toContain("Unknown project");
    expect(text).toContain("Orphan archived");
  });

  it("lists each archived subtree once and exposes a child archived without its parent", async () => {
    harness.threadShells = [
      thread({ id: "active-parent", title: "Active parent" }),
      thread({
        id: "recoverable-child",
        title: "Recoverable archived child",
        parentThreadId: "active-parent",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
      thread({
        id: "archived-parent",
        title: "Archived parent",
        archivedAt: "2026-01-03T00:00:00.000Z",
      }),
      thread({
        id: "represented-child",
        title: "Represented archived child",
        parentThreadId: "archived-parent",
        archivedAt: "2026-01-03T00:00:00.000Z",
      }),
    ];

    await render(<ArchivedSettingsPanel active />);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Recoverable archived child");
    expect(text).toContain("Archived parent");
    expect(text).not.toContain("Represented archived child");
  });

  it("lays archived threads out in three columns and toggles a group with a chevron", async () => {
    harness.threadShells = [
      thread({
        id: "one",
        title: "First archived",
        archivedAt: "2026-01-03T00:00:00.000Z",
      }),
      thread({
        id: "two",
        title: "Second archived",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
      thread({
        id: "three",
        title: "Third archived",
        archivedAt: "2026-01-01T00:00:00.000Z",
      }),
      thread({
        id: "four",
        title: "Fourth archived",
        archivedAt: "2025-12-28T00:00:00.000Z",
      }),
      thread({
        id: "five",
        title: "Fifth archived",
        archivedAt: "2025-12-20T00:00:00.000Z",
      }),
      thread({
        id: "six",
        title: "Sixth archived",
        archivedAt: "2025-12-12T00:00:00.000Z",
      }),
    ];

    await render(<ArchivedSettingsPanel active />);

    const grid = document.body.querySelector('[class*="grid-cols-3"]');
    expect(grid).not.toBeNull();

    const toggle = page.getByRole("button", { name: "Project One" });
    expect(toggle.element().getAttribute("aria-expanded")).toBe("true");
    expect(document.body.querySelector("div[inert]")).toBeNull();

    await toggle.click();
    await vi.waitFor(() => expect(toggle.element().getAttribute("aria-expanded")).toBe("false"));

    const disclosureShell = document.body.querySelector("div[inert]");
    expect(disclosureShell).not.toBeNull();
    expect(disclosureShell?.className).toContain("duration-220");
  });

  it("filters archived threads by title", async () => {
    harness.threadShells = [
      thread({
        id: "older",
        title: "Older archived",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
      thread({
        id: "newer",
        title: "Newer archived",
        archivedAt: "2026-01-03T00:00:00.000Z",
      }),
    ];

    await render(<ArchivedSettingsPanel active />);
    await page.getByLabelText("Search archived threads").fill("newer");

    const text = document.body.textContent ?? "";
    expect(text).toContain("Newer archived");
    expect(text).not.toContain("Older archived");
  });

  it("shows an empty search state when no archived title matches", async () => {
    harness.threadShells = [
      thread({
        id: "older",
        title: "Older archived",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
    ];

    await render(<ArchivedSettingsPanel active />);
    await page.getByLabelText("Search archived threads").fill("missing");

    expect(document.body.textContent).toContain('No archived threads match “missing”.');
  });
});
