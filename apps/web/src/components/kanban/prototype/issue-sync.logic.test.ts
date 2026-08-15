import { describe, expect, it } from "vitest";

import {
  addIssuesAsDrafts,
  applyAutopopulatedDrafts,
  buildIssueDraftPrompt,
  countActivePrototypeIssueFilterGroups,
  filterPrototypeIssues,
  issueKindFromLabels,
  issuesListStateFromFilters,
  prototypeIssueFromListEntry,
  removeAutopopulatedDrafts,
  togglePrototypeFilterValue,
} from "./issue-sync.logic";
import { EMPTY_PROTOTYPE_ISSUE_FILTERS, PROTOTYPE_ISSUES } from "./scenarios";
import type { PrototypeBoardCard, PrototypeIssue } from "./issue-sync.types";

function issueById(id: string): PrototypeIssue {
  const issue = PROTOTYPE_ISSUES.find((candidate) => candidate.id === id);
  if (!issue) {
    throw new Error(`Missing fixture ${id}`);
  }
  return issue;
}

const first = issueById("issue-1842");
const second = issueById("issue-1831");
const closed = PROTOTYPE_ISSUES.find((issue) => issue.state === "closed");

describe("filterPrototypeIssues", () => {
  it("returns every issue when filters are empty", () => {
    expect(filterPrototypeIssues(PROTOTYPE_ISSUES, EMPTY_PROTOTYPE_ISSUE_FILTERS)).toHaveLength(
      PROTOTYPE_ISSUES.length,
    );
  });

  it("filters by repo, state, and query together", () => {
    const matches = filterPrototypeIssues(PROTOTYPE_ISSUES, {
      query: "kanban",
      repoIds: ["repo-luminor"],
      labels: [],
      states: ["open"],
      kinds: [],
    });
    expect(matches.every((issue) => issue.repoId === "repo-luminor")).toBe(true);
    expect(matches.every((issue) => issue.state === "open")).toBe(true);
    expect(matches.some((issue) => issue.number === 1842)).toBe(true);
  });

  it("hides excluded ids used by triage skip/accept", () => {
    const matches = filterPrototypeIssues(
      PROTOTYPE_ISSUES,
      EMPTY_PROTOTYPE_ISSUE_FILTERS,
      new Set([first.id]),
    );
    expect(matches.some((issue) => issue.id === first.id)).toBe(false);
  });
});

describe("addIssuesAsDrafts", () => {
  it("prepends only issues that are not already on the board", () => {
    const existing: PrototypeBoardCard[] = [
      {
        id: "card-issue-issue-1842",
        column: "draft",
        title: first.title,
        source: "accepted",
        issueId: first.id,
        issueNumber: first.number,
        repo: first.repo,
        labels: first.labels,
        preview: first.body,
        meta: `#${first.number} · ${first.repo}`,
      },
    ];
    const next = addIssuesAsDrafts(existing, [first, second], "imported");
    expect(next).toHaveLength(2);
    expect(next[0]?.issueId).toBe(second.id);
    expect(next[0]?.source).toBe("imported");
  });
});

describe("applyAutopopulatedDrafts", () => {
  it("adds matching issues and drops stale autopopulated cards", () => {
    const stale: PrototypeBoardCard[] = [
      {
        id: "card-issue-stale",
        column: "draft",
        title: "Stale",
        source: "autopopulated",
        issueId: "missing",
        issueNumber: 1,
        repo: "Luminor",
        labels: [],
        preview: null,
        meta: "#1 · Luminor",
      },
    ];
    const next = applyAutopopulatedDrafts(stale, [first]);
    expect(next).toHaveLength(1);
    expect(next[0]?.issueId).toBe(first.id);
    expect(next[0]?.source).toBe("autopopulated");
  });

  it("does not overwrite a manually accepted card", () => {
    const accepted: PrototypeBoardCard[] = [
      {
        id: "card-issue-issue-1842",
        column: "draft",
        title: first.title,
        source: "accepted",
        issueId: first.id,
        issueNumber: first.number,
        repo: first.repo,
        labels: first.labels,
        preview: first.body,
        meta: `#${first.number} · ${first.repo}`,
      },
    ];
    const next = applyAutopopulatedDrafts(accepted, [first]);
    expect(next).toHaveLength(1);
    expect(next[0]?.source).toBe("accepted");
  });
});

describe("removeAutopopulatedDrafts", () => {
  it("keeps seed and accepted cards", () => {
    const cards: PrototypeBoardCard[] = [
      {
        id: "seed",
        column: "done",
        title: "Seed",
        source: "seed",
        issueId: null,
        issueNumber: null,
        repo: null,
        labels: [],
        preview: null,
        meta: "Done",
      },
      {
        id: "auto",
        column: "draft",
        title: first.title,
        source: "autopopulated",
        issueId: first.id,
        issueNumber: first.number,
        repo: first.repo,
        labels: [],
        preview: null,
        meta: "Draft",
      },
    ];
    expect(removeAutopopulatedDrafts(cards)).toEqual([cards[0]]);
  });
});

describe("togglePrototypeFilterValue", () => {
  it("adds and removes a value", () => {
    expect(togglePrototypeFilterValue(["open"], "closed")).toEqual(["open", "closed"]);
    expect(togglePrototypeFilterValue(["open", "closed"], "open")).toEqual(["closed"]);
  });
});

describe("issuesListStateFromFilters", () => {
  it("fetches open issues unless closed is selected", () => {
    expect(issuesListStateFromFilters([])).toBe("open");
    expect(issuesListStateFromFilters(["open"])).toBe("open");
    expect(issuesListStateFromFilters(["closed"])).toBe("closed");
    expect(issuesListStateFromFilters(["open", "closed"])).toBe("all");
  });
});

describe("prototypeIssueFromListEntry", () => {
  it("maps a GitHub list entry onto the inbox row shape", () => {
    const issue = prototypeIssueFromListEntry({
      id: "acme/app#6",
      number: 6,
      title: "GitHub issue sync",
      body: "Connect the inbox.",
      repository: "acme/app",
      repositoryName: "app",
      state: "open",
      labels: ["bug"],
      author: "octocat",
      assignee: null,
      commentCount: 0,
      updatedAt: new Date().toISOString(),
      url: "https://github.com/acme/app/issues/6",
      projectIds: [],
    });
    expect(issue.repo).toBe("app");
    expect(issue.repoId).toBe("acme/app");
    expect(issue.kind).toBe(issueKindFromLabels(["bug"]));
    expect(issue.kind).toBe("bug");
  });
});

describe("buildIssueDraftPrompt", () => {
  it("uses only the title and body", () => {
    const prompt = buildIssueDraftPrompt(first);
    expect(prompt.startsWith("Sync GitHub issues onto the Kanban board as drafts")).toBe(true);
    expect(prompt).toContain("PRs already land on the board");
    expect(prompt).not.toContain("#1842");
    expect(prompt).not.toContain("nara:");
  });
});

describe("countActivePrototypeIssueFilterGroups", () => {
  it("ignores search query and counts menu groups only", () => {
    expect(
      countActivePrototypeIssueFilterGroups({
        ...EMPTY_PROTOTYPE_ISSUE_FILTERS,
        query: "kanban",
        repoIds: ["repo-luminor"],
        states: ["open"],
      }),
    ).toBe(2);
  });
});

describe("fixtures", () => {
  it("includes at least one closed issue for the state filter", () => {
    expect(closed).toBeDefined();
  });
});
