import { Schema } from "effect";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  TrimmedNonEmptyString,
} from "./baseSchemas";

export const IssueState = Schema.Literals(["open", "closed"]);
export type IssueState = typeof IssueState.Type;

export const IssuesListState = Schema.Literals(["open", "closed", "all"]);
export type IssuesListState = typeof IssuesListState.Type;

export const IssueComment = Schema.Struct({
  id: TrimmedNonEmptyString,
  author: TrimmedNonEmptyString,
  body: Schema.String,
  createdAt: TrimmedNonEmptyString,
});
export type IssueComment = typeof IssueComment.Type;

export const IssueListEntry = Schema.Struct({
  id: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  body: Schema.String,
  repository: TrimmedNonEmptyString,
  repositoryName: TrimmedNonEmptyString,
  state: IssueState,
  labels: Schema.Array(TrimmedNonEmptyString),
  author: TrimmedNonEmptyString,
  assignee: Schema.NullOr(TrimmedNonEmptyString),
  commentCount: NonNegativeInt,
  updatedAt: IsoDateTime,
  url: TrimmedNonEmptyString,
  projectIds: Schema.Array(ProjectId),
});
export type IssueListEntry = typeof IssueListEntry.Type;

export const IssuesListInput = Schema.Struct({
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  state: Schema.optional(IssuesListState),
  forceRefresh: Schema.optional(Schema.Boolean),
});
export type IssuesListInput = typeof IssuesListInput.Type;

export const IssuesListError = Schema.Struct({
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
});
export type IssuesListError = typeof IssuesListError.Type;

export const IssuesListResult = Schema.Struct({
  viewer: Schema.NullOr(TrimmedNonEmptyString),
  entries: Schema.Array(IssueListEntry),
  errors: Schema.Array(IssuesListError),
});
export type IssuesListResult = typeof IssuesListResult.Type;

export const IssuesViewInput = Schema.Struct({
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
});
export type IssuesViewInput = typeof IssuesViewInput.Type;

export const IssuesViewResult = Schema.Struct({
  entry: IssueListEntry,
  comments: Schema.Array(IssueComment),
});
export type IssuesViewResult = typeof IssuesViewResult.Type;
