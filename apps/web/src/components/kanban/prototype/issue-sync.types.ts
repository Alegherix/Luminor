// FILE: issue-sync.types.ts
// Purpose: Shared types for the GitHub-issues-to-Kanban discovery prototype.
// Layer: Kanban prototype (mocked)

export type PrototypeIssueState = "open" | "closed";

export type PrototypeIssueKind = "bug" | "enhancement" | "docs";

export type PrototypeCardColumn = "draft" | "inProgress" | "done";

export type PrototypeCardSource = "seed" | "accepted" | "imported" | "autopopulated";

export interface PrototypeIssueComment {
  id: string;
  author: string;
  body: string;
  updatedAt: string;
}

export interface PrototypeIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  repo: string;
  repoId: string;
  state: PrototypeIssueState;
  kind: PrototypeIssueKind;
  labels: readonly string[];
  author: string;
  assignee: string | null;
  comments: readonly PrototypeIssueComment[];
  updatedAt: string;
}

export interface PrototypeBoardCard {
  id: string;
  column: PrototypeCardColumn;
  title: string;
  source: PrototypeCardSource;
  issueId: string | null;
  issueNumber: number | null;
  repo: string | null;
  labels: readonly string[];
  preview: string | null;
  meta: string;
}

export interface PrototypeIssueFilters {
  query: string;
  repoIds: readonly string[];
  labels: readonly string[];
  states: readonly PrototypeIssueState[];
  kinds: readonly PrototypeIssueKind[];
}

export interface PrototypeRepo {
  id: string;
  name: string;
}
