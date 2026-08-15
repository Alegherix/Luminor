import { describe, expect, it } from "vitest";

import {
  isAutomatedPullRequestCommentAuthor,
  isPullRequestInboxUnread,
  isQualifyingPullRequestInboxReason,
  laterIsoTimestamp,
  parseGitHubCommentApiPath,
  parsePullRequestFromNotificationSubject,
  pullRequestInboxIdentityKey,
  shouldNotifyPullRequestInboxComment,
} from "./pullRequestInbox";

describe("isAutomatedPullRequestCommentAuthor", () => {
  it("keeps human logins and treats bots and Actions as automated", () => {
    expect(isAutomatedPullRequestCommentAuthor({ login: "alegherix" })).toBe(false);
    expect(isAutomatedPullRequestCommentAuthor({ login: "github-actions[bot]" })).toBe(true);
    expect(isAutomatedPullRequestCommentAuthor({ login: "codecov", type: "Bot" })).toBe(true);
    expect(isAutomatedPullRequestCommentAuthor({ login: "cursor[bot]" })).toBe(true);
    expect(isAutomatedPullRequestCommentAuthor({ login: "reviewer", type: "User" })).toBe(false);
    expect(isAutomatedPullRequestCommentAuthor({ login: null })).toBe(false);
  });
});

describe("isQualifyingPullRequestInboxReason", () => {
  it("accepts human conversation reasons and rejects CI and review-request noise", () => {
    expect(isQualifyingPullRequestInboxReason("comment")).toBe(true);
    expect(isQualifyingPullRequestInboxReason("mention")).toBe(true);
    expect(isQualifyingPullRequestInboxReason("author")).toBe(true);
    expect(isQualifyingPullRequestInboxReason("ci_activity")).toBe(false);
    expect(isQualifyingPullRequestInboxReason("review_requested")).toBe(false);
    expect(isQualifyingPullRequestInboxReason("state_change")).toBe(false);
  });
});

describe("parsePullRequestFromNotificationSubject", () => {
  it("reads owner/repo and number from a GitHub pull-request subject", () => {
    expect(
      parsePullRequestFromNotificationSubject({
        type: "PullRequest",
        url: "https://api.github.com/repos/acme/luminor/pulls/42",
        repository: "acme/luminor",
      }),
    ).toEqual({ repository: "acme/luminor", number: 42 });
    expect(
      parsePullRequestFromNotificationSubject({
        type: "Issue",
        url: "https://api.github.com/repos/acme/luminor/issues/42",
        repository: "acme/luminor",
      }),
    ).toBeNull();
  });
});

describe("parseGitHubCommentApiPath", () => {
  it("accepts only GitHub issue and review comment API URLs", () => {
    expect(
      parseGitHubCommentApiPath("https://api.github.com/repos/acme/luminor/issues/comments/9"),
    ).toBe("repos/acme/luminor/issues/comments/9");
    expect(
      parseGitHubCommentApiPath("https://api.github.com/repos/acme/luminor/pulls/comments/11"),
    ).toBe("repos/acme/luminor/pulls/comments/11");
    expect(
      parseGitHubCommentApiPath("https://evil.example/repos/acme/luminor/issues/comments/9"),
    ).toBe(null);
  });
});

describe("inbox read and notify decisions", () => {
  it("treats never-viewed activity as unread and baselines first-run notifications", () => {
    expect(
      isPullRequestInboxUnread({
        lastViewedAt: null,
        activityAt: "2026-08-13T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isPullRequestInboxUnread({
        lastViewedAt: "2026-08-13T12:00:00.000Z",
        activityAt: "2026-08-13T11:59:59.000Z",
      }),
    ).toBe(false);
    expect(
      isPullRequestInboxUnread({
        lastViewedAt: "2026-08-13T12:00:00.000Z",
        activityAt: "2026-08-13T12:00:01.000Z",
      }),
    ).toBe(true);
    expect(
      shouldNotifyPullRequestInboxComment({
        unread: true,
        commentId: "comment-1",
        lastNotifiedCommentId: null,
        inboxInitialized: false,
      }),
    ).toBe(false);
    expect(
      shouldNotifyPullRequestInboxComment({
        unread: true,
        commentId: "comment-2",
        lastNotifiedCommentId: "comment-1",
        inboxInitialized: true,
      }),
    ).toBe(true);
    expect(
      shouldNotifyPullRequestInboxComment({
        unread: true,
        commentId: "comment-1",
        lastNotifiedCommentId: "comment-1",
        inboxInitialized: true,
      }),
    ).toBe(false);
  });

  it("keeps identity keys and timestamps stable", () => {
    expect(pullRequestInboxIdentityKey("Acme/Luminor", 4)).toBe("acme/luminor#4");
    expect(laterIsoTimestamp("2026-08-13T12:00:00.000Z", "2026-08-13T12:01:00.000Z")).toBe(
      "2026-08-13T12:01:00.000Z",
    );
  });
});
