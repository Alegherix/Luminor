import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createGitHubCliWithFakeGh } from "../git/testing/fakeGitHubCli";
import {
  loadPullRequestInbox,
  makeMemoryPullRequestInboxState,
  previewPullRequestInboxCommentBody,
} from "./pullRequestInbox";

const commentUrl = "https://api.github.com/repos/acme/luminor/issues/comments/3";

function inboxGithub(commentId: string) {
  return createGitHubCliWithFakeGh({
    inboxNotifications: [
      {
        id: "n-1",
        unread: true,
        reason: "comment",
        updatedAt: "2026-08-13T15:00:00.000Z",
        title: "Watch comments",
        repository: "acme/luminor",
        number: 3,
        latestCommentUrl: commentUrl,
      },
    ],
    inboxComments: {
      [commentUrl]: {
        id: commentId,
        body: "Can you extract this?",
        url: "https://github.com/acme/luminor/pull/3#issuecomment-3",
        createdAt: "2026-08-13T15:00:00.000Z",
        authorLogin: "reviewer",
        authorType: "User",
      },
    },
  }).service;
}

describe("loadPullRequestInbox", () => {
  it("does not notify on the first poll and does notify after a new human comment", async () => {
    const inbox = makeMemoryPullRequestInboxState();
    const first = await Effect.runPromise(
      loadPullRequestInbox({
        cwd: "/tmp/repo",
        repositories: new Set(["acme/luminor"]),
        inventoryIncomplete: false,
        github: inboxGithub("comment-1"),
        inbox,
        now: () => "2026-08-13T15:00:00.000Z",
        withGitHubRead: (effect) => effect,
      }),
    );
    expect(first.items[0]?.notify).toBe(false);
    expect(first.unreadCount).toBe(1);

    const second = await Effect.runPromise(
      loadPullRequestInbox({
        cwd: "/tmp/repo",
        repositories: new Set(["acme/luminor"]),
        inventoryIncomplete: false,
        github: inboxGithub("comment-2"),
        inbox,
        now: () => "2026-08-13T15:05:00.000Z",
        withGitHubRead: (effect) => effect,
      }),
    );
    expect(second.items[0]?.notify).toBe(true);
    expect(second.items[0]?.comment?.id).toBe("comment-2");
  });

  it("hides viewed comments and GitHub Actions activity", async () => {
    expect(previewPullRequestInboxCommentBody("  please   fix  ")).toBe("please fix");
    const inbox = makeMemoryPullRequestInboxState();
    await Effect.runPromise(inbox.markInitialized("2026-08-13T14:00:00.000Z"));
    await Effect.runPromise(
      inbox.markViewed({
        repositoryKey: "acme/luminor",
        number: 3,
        viewedAt: "2026-08-13T16:00:00.000Z",
      }),
    );
    const result = await Effect.runPromise(
      loadPullRequestInbox({
        cwd: "/tmp/repo",
        repositories: new Set(["acme/luminor"]),
        inventoryIncomplete: false,
        github: inboxGithub("comment-viewed"),
        inbox,
        now: () => "2026-08-13T16:01:00.000Z",
        withGitHubRead: (effect) => effect,
      }),
    );
    expect(result.items[0]?.unread).toBe(false);
    expect(result.items[0]?.notify).toBe(false);
  });
});
