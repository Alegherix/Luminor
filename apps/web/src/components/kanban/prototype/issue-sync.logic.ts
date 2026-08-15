// FILE: issue-sync.logic.ts
// Purpose: Pure filter/accept/import/autopopulate math for the issues prototype.
// Layer: Kanban prototype logic (no React)

import type { IssueComment, IssueListEntry, IssuesListState } from "@luminor/contracts";

import { formatRelativeTime } from "~/lib/relativeTime";
import type {
  PrototypeBoardCard,
  PrototypeIssue,
  PrototypeIssueComment,
  PrototypeIssueFilters,
  PrototypeIssueKind,
  PrototypeIssueState,
  PrototypeRepo,
} from "./issue-sync.types";

export function togglePrototypeFilterValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function arePrototypeIssueFiltersActive(filters: PrototypeIssueFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.repoIds.length > 0 ||
    filters.labels.length > 0 ||
    filters.states.length > 0 ||
    filters.kinds.length > 0
  );
}

export function countActivePrototypeIssueFilterGroups(filters: PrototypeIssueFilters): number {
  return [filters.repoIds.length > 0, filters.states.length > 0, filters.labels.length > 0].filter(
    Boolean,
  ).length;
}

export function filterPrototypeIssues(
  issues: readonly PrototypeIssue[],
  filters: PrototypeIssueFilters,
  excludeIds: ReadonlySet<string> = new Set(),
): PrototypeIssue[] {
  const query = filters.query.trim().toLowerCase();
  return issues.filter((issue) => {
    if (excludeIds.has(issue.id)) {
      return false;
    }
    if (filters.repoIds.length > 0 && !filters.repoIds.includes(issue.repoId)) {
      return false;
    }
    if (filters.states.length > 0 && !filters.states.includes(issue.state)) {
      return false;
    }
    if (filters.kinds.length > 0 && !filters.kinds.includes(issue.kind)) {
      return false;
    }
    if (
      filters.labels.length > 0 &&
      !filters.labels.some((label) => issue.labels.includes(label))
    ) {
      return false;
    }
    if (query.length === 0) {
      return true;
    }
    const haystack =
      `${issue.title} ${issue.number} ${issue.repo} ${issue.labels.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function issueIdsOnBoard(cards: readonly PrototypeBoardCard[]): Set<string> {
  return new Set(cards.flatMap((card) => (card.issueId ? [card.issueId] : [])));
}

export function cardFromIssue(
  issue: PrototypeIssue,
  source: Exclude<PrototypeBoardCard["source"], "seed">,
): PrototypeBoardCard {
  return {
    id: `card-issue-${issue.id}`,
    column: "draft",
    title: issue.title,
    source,
    issueId: issue.id,
    issueNumber: issue.number,
    repo: issue.repo,
    labels: issue.labels,
    preview: issue.body,
    meta: `GitHub · ${issue.repo} #${issue.number}`,
  };
}

export function addIssuesAsDrafts(
  cards: readonly PrototypeBoardCard[],
  issues: readonly PrototypeIssue[],
  source: Exclude<PrototypeBoardCard["source"], "seed">,
): PrototypeBoardCard[] {
  const existing = issueIdsOnBoard(cards);
  const nextDrafts = issues
    .filter((issue) => !existing.has(issue.id))
    .map((issue) => cardFromIssue(issue, source));
  if (nextDrafts.length === 0) {
    return [...cards];
  }
  return [...nextDrafts, ...cards];
}

export function applyAutopopulatedDrafts(
  cards: readonly PrototypeBoardCard[],
  matchingIssues: readonly PrototypeIssue[],
): PrototypeBoardCard[] {
  const matchingIds = new Set(matchingIssues.map((issue) => issue.id));
  const kept = cards.filter((card) => {
    if (card.source !== "autopopulated") {
      return true;
    }
    return card.issueId !== null && matchingIds.has(card.issueId);
  });
  const already = issueIdsOnBoard(kept);
  const additions = matchingIssues
    .filter((issue) => !already.has(issue.id))
    .map((issue) => cardFromIssue(issue, "autopopulated"));
  return [...additions, ...kept];
}

export function removeAutopopulatedDrafts(
  cards: readonly PrototypeBoardCard[],
): PrototypeBoardCard[] {
  return cards.filter((card) => card.source !== "autopopulated");
}

export const PROTOTYPE_ISSUE_STATES: readonly PrototypeIssueState[] = ["open", "closed"];

export const PROTOTYPE_ISSUE_KINDS: readonly PrototypeIssueKind[] = ["bug", "enhancement", "docs"];

export function buildIssueDraftPrompt(issue: PrototypeIssue): string {
  const title = issue.title.trim();
  const body = issue.body.trim();
  if (body.length === 0) {
    return title;
  }
  return `${title}\n\n${body}`;
}

export function collectPrototypeRepos(issues: readonly PrototypeIssue[]): PrototypeRepo[] {
  const seen = new Map<string, string>();
  for (const issue of issues) {
    if (!seen.has(issue.repoId)) {
      seen.set(issue.repoId, issue.repo);
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function collectPrototypeLabels(issues: readonly PrototypeIssue[]): string[] {
  const kindSet = new Set<string>(PROTOTYPE_ISSUE_KINDS);
  return [...new Set(issues.flatMap((issue) => issue.labels))]
    .filter((label) => !kindSet.has(label))
    .sort();
}

export function issueKindFromLabels(labels: readonly string[]): PrototypeIssueKind {
  const lower = labels.map((label) => label.toLowerCase());
  if (lower.some((label) => label === "bug" || label === "type: bug")) {
    return "bug";
  }
  if (lower.some((label) => label === "docs" || label === "documentation")) {
    return "docs";
  }
  return "enhancement";
}

export function issuesListStateFromFilters(
  states: readonly PrototypeIssueState[],
): IssuesListState {
  const wantsOpen = states.length === 0 || states.includes("open");
  const wantsClosed = states.includes("closed");
  if (wantsOpen && wantsClosed) return "all";
  if (wantsClosed && !wantsOpen) return "closed";
  return "open";
}

export function prototypeCommentsFromIssueComments(
  comments: readonly IssueComment[],
): PrototypeIssueComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    author: comment.author,
    body: comment.body,
    updatedAt: formatRelativeTime(comment.createdAt),
  }));
}

export function prototypeIssueFromListEntry(
  entry: IssueListEntry,
  comments: readonly PrototypeIssueComment[] = [],
): PrototypeIssue {
  return {
    id: entry.id,
    number: entry.number,
    title: entry.title,
    body: entry.body,
    repo: entry.repositoryName,
    repoId: entry.repository,
    state: entry.state,
    kind: issueKindFromLabels(entry.labels),
    labels: entry.labels,
    author: entry.author,
    assignee: entry.assignee,
    comments,
    updatedAt: formatRelativeTime(entry.updatedAt),
  };
}
