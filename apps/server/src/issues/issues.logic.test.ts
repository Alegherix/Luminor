import { ProjectId } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import type { GitHubIssueListItem } from "../git/Services/GitHubCli";
import {
  buildIssueComments,
  buildIssueListEntry,
  issueListIdentity,
  orderIssueListEntries,
  repositoryNameFromOwnerRepo,
} from "./issues.logic";

const projectId = ProjectId.makeUnsafe("project-acme");

function makeIssue(overrides: Partial<GitHubIssueListItem> = {}): GitHubIssueListItem {
  return {
    id: "I_1",
    number: 6,
    title: "GitHub issue sync",
    body: "Wire the inbox to gh.",
    url: "https://github.com/acme/app/issues/6",
    state: "open",
    author: "octocat",
    assignee: null,
    labels: ["enhancement"],
    commentCount: 0,
    comments: [],
    updatedAt: "2026-08-15T16:59:55Z",
    ...overrides,
  };
}

describe("issue list mapping", () => {
  it("uses owner/repo#number as the stable identity", () => {
    expect(issueListIdentity("Acme/App", 6)).toBe("acme/app#6");
    expect(repositoryNameFromOwnerRepo("acme/app")).toBe("app");
  });

  it("maps a GitHub issue onto the list contract", () => {
    const issue = makeIssue({
      comments: [
        { id: "c1", author: "hubot", body: "Looks good", createdAt: "2026-08-15T17:00:00Z" },
      ],
      commentCount: 1,
    });
    const entry = buildIssueListEntry({
      repository: "acme/app",
      issue,
      projectIds: [projectId],
    });
    expect(entry.id).toBe("acme/app#6");
    expect(entry.repositoryName).toBe("app");
    expect(entry.commentCount).toBe(1);
    expect(entry.projectIds).toEqual([projectId]);
    expect(buildIssueComments(issue)).toEqual([
      { id: "c1", author: "hubot", body: "Looks good", createdAt: "2026-08-15T17:00:00Z" },
    ]);
  });

  it("orders issues by newest update first", () => {
    const older = buildIssueListEntry({
      repository: "acme/app",
      issue: makeIssue({ number: 5, title: "Older", updatedAt: "2026-08-14T00:00:00Z" }),
      projectIds: [projectId],
    });
    const newer = buildIssueListEntry({
      repository: "acme/app",
      issue: makeIssue({ number: 6, title: "Newer", updatedAt: "2026-08-15T00:00:00Z" }),
      projectIds: [projectId],
    });
    expect(orderIssueListEntries([older, newer]).map((entry) => entry.number)).toEqual([6, 5]);
  });
});
