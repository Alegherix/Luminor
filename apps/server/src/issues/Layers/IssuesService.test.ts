import { ProjectId } from "@luminor/contracts";
import type { OrchestrationProject } from "@luminor/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createGitHubCliWithFakeGh } from "../../git/testing/fakeGitHubCli";
import { makeIssuesService } from "./IssuesService";

const now = "2026-08-15T16:00:00.000Z";

function makeProject(id: string, title: string, workspaceRoot: string): OrchestrationProject {
  return {
    id: ProjectId.makeUnsafe(id),
    kind: "project",
    title,
    workspaceRoot,
    defaultModelSelection: null,
    scripts: [],
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

describe("IssuesService", () => {
  it("lists open issues once for projects that share a repository", async () => {
    const projectA = makeProject("project-issues-a", "App", "/tmp/app-a");
    const projectB = makeProject("project-issues-b", "App clone", "/tmp/app-b");
    const { service: github, ghCalls } = createGitHubCliWithFakeGh({
      repositoryIssueListJson: JSON.stringify([
        {
          id: "I_1",
          number: 6,
          title: "GitHub issue sync",
          body: "Connect the inbox.",
          state: "OPEN",
          url: "https://github.com/acme/app/issues/6",
          updatedAt: "2026-08-15T16:59:55Z",
          author: { login: "octocat" },
          assignees: [],
          labels: [{ name: "enhancement" }],
          comments: [],
        },
      ]),
    });

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const issues = yield* makeIssuesService({
            homeDir: "/tmp",
            github,
            listProjects: () => Effect.succeed([projectA, projectB]),
            resolveRepositories: () =>
              Effect.succeed({
                repositories: [{ nameWithOwner: "acme/app", url: "https://github.com/acme/app" }],
                authoritative: true,
              }),
          });
          return yield* issues.list({ state: "open" });
        }),
      ),
    );

    expect(ghCalls.filter((call) => call.startsWith("issue list"))).toHaveLength(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.id).toBe("acme/app#6");
    expect(result.entries[0]?.title).toBe("GitHub issue sync");
    expect(result.entries[0]?.repositoryName).toBe("app");
    expect(result.entries[0]?.projectIds).toHaveLength(2);
    expect(result.errors).toEqual([]);
  });

  it("loads comments through issue view", async () => {
    const project = makeProject("project-issues-view", "App", "/tmp/app");
    const { service: github } = createGitHubCliWithFakeGh({
      repositoryIssueJson: JSON.stringify({
        id: "I_1",
        number: 6,
        title: "GitHub issue sync",
        body: "Connect the inbox.",
        state: "OPEN",
        url: "https://github.com/acme/app/issues/6",
        updatedAt: "2026-08-15T16:59:55Z",
        author: { login: "octocat" },
        assignees: [{ login: "octocat" }],
        labels: [],
        comments: [
          {
            id: "C_1",
            body: "Start with gh issue list.",
            createdAt: "2026-08-15T17:10:00Z",
            author: { login: "hubot" },
          },
        ],
      }),
    });

    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const issues = yield* makeIssuesService({
            homeDir: "/tmp",
            github,
            listProjects: () => Effect.succeed([project]),
            resolveRepositories: () =>
              Effect.succeed({
                repositories: [{ nameWithOwner: "acme/app", url: "https://github.com/acme/app" }],
                authoritative: true,
              }),
          });
          return yield* issues.view({ repository: "acme/app", number: 6 });
        }),
      ),
    );

    expect(result.entry.assignee).toBe("octocat");
    expect(result.comments).toEqual([
      {
        id: "C_1",
        author: "hubot",
        body: "Start with gh issue list.",
        createdAt: "2026-08-15T17:10:00Z",
      },
    ]);
  });
});
