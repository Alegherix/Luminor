import { describe, expect, it } from "vitest";

import {
  buildPullRequestInboxNotificationCopy,
  parsePullRequestInboxNotificationAction,
  pullRequestInboxNotificationAction,
  pullRequestListEntryIsUnread,
  indexPullRequestInboxItems,
} from "./pullRequestInbox.logic";

const item = {
  repository: "acme/luminor",
  number: 12,
  title: "Add inbox",
  url: "https://github.com/acme/luminor/pull/12",
  updatedAt: "2026-08-13T12:00:00.000Z",
  unread: true,
  notify: true,
  comment: {
    id: "c1",
    authorLogin: "reviewer",
    bodyPreview: "Please rename this.",
    createdAt: "2026-08-13T12:00:00.000Z",
    url: null,
  },
};

describe("pull request inbox presentation", () => {
  it("indexes unread rows and builds a comment notification", () => {
    const indexed = indexPullRequestInboxItems([item]);
    expect(
      pullRequestListEntryIsUnread({ repository: "acme/luminor", number: 12 }, indexed),
    ).toBe(true);
    expect(
      pullRequestListEntryIsUnread({ repository: "acme/luminor", number: 13 }, indexed),
    ).toBe(false);
    expect(buildPullRequestInboxNotificationCopy(item)).toEqual({
      title: "reviewer commented on #12",
      body: "Add inbox: Please rename this.",
    });
  });

  it("round-trips the desktop notification action", () => {
    const action = pullRequestInboxNotificationAction(item);
    expect(parsePullRequestInboxNotificationAction(action)).toEqual({
      repository: "acme/luminor",
      number: 12,
    });
    expect(parsePullRequestInboxNotificationAction("notification-open-thread:abc")).toBeNull();
  });
});
