import type { IssueComment, IssueListEntry, ProjectId } from "@luminor/contracts";

import type { GitHubIssueListItem } from "../git/Services/GitHubCli";

export function issueListIdentity(repository: string, number: number): string {
  return `${repository.trim().toLowerCase()}#${number}`;
}

export function repositoryNameFromOwnerRepo(repository: string): string {
  const trimmed = repository.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

export function buildIssueListEntry(input: {
  repository: string;
  issue: GitHubIssueListItem;
  projectIds: readonly ProjectId[];
}): IssueListEntry {
  return {
    id: issueListIdentity(input.repository, input.issue.number),
    number: input.issue.number,
    title: input.issue.title,
    body: input.issue.body,
    repository: input.repository,
    repositoryName: repositoryNameFromOwnerRepo(input.repository),
    state: input.issue.state,
    labels: [...input.issue.labels],
    author: input.issue.author,
    assignee: input.issue.assignee,
    commentCount: input.issue.commentCount,
    updatedAt: input.issue.updatedAt,
    url: input.issue.url,
    projectIds: [...input.projectIds],
  };
}

export function buildIssueComments(issue: GitHubIssueListItem): IssueComment[] {
  return issue.comments.map((comment) => ({
    id: comment.id,
    author: comment.author,
    body: comment.body,
    createdAt: comment.createdAt,
  }));
}

export function orderIssueListEntries(entries: readonly IssueListEntry[]): IssueListEntry[] {
  return [...entries].sort((left, right) => {
    const time = right.updatedAt.localeCompare(left.updatedAt);
    if (time !== 0) return time;
    const repo = left.repository.localeCompare(right.repository);
    if (repo !== 0) return repo;
    return right.number - left.number;
  });
}
