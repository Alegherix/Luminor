import type {
  PullRequestInboxItem,
  PullRequestInboxMarkNotifiedInput,
  PullRequestInboxMarkViewedInput,
  PullRequestInboxResult,
} from "@luminor/contracts";
import {
  isAutomatedPullRequestCommentAuthor,
  isPullRequestInboxUnread,
  isQualifyingPullRequestInboxReason,
  laterIsoTimestamp,
  pullRequestInboxIdentityKey,
  shouldNotifyPullRequestInboxComment,
} from "@luminor/shared/pullRequestInbox";
import { Effect } from "effect";

import type {
  GitHubCliShape,
  GitHubPullRequestInboxComment,
  GitHubPullRequestInboxNotification,
} from "../git/Services/GitHubCli";
import type { PullRequestInboxStateShape } from "../persistence/Services/PullRequestInboxState";

const INBOX_NOTIFICATION_LIMIT = 50;
const INBOX_COMMENT_CONCURRENCY = 6;
const COMMENT_PREVIEW_MAX_LENGTH = 160;

export function previewPullRequestInboxCommentBody(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  return collapsed.length > COMMENT_PREVIEW_MAX_LENGTH
    ? `${collapsed.slice(0, COMMENT_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`
    : collapsed;
}

export function makeMemoryPullRequestInboxState(): PullRequestInboxStateShape {
  let initializedAt: string | null = null;
  const rows = new Map<
    string,
    {
      repositoryKey: string;
      number: number;
      lastViewedAt: string | null;
      lastNotifiedCommentId: string | null;
    }
  >();
  return {
    initializedAt: () => Effect.succeed(initializedAt),
    markInitialized: (value) =>
      Effect.sync(() => {
        initializedAt ??= value;
      }),
    list: () => Effect.succeed([...rows.values()]),
    markViewed: (input) =>
      Effect.sync(() => {
        const key = pullRequestInboxIdentityKey(input.repositoryKey, input.number);
        const current = rows.get(key);
        rows.set(key, {
          repositoryKey: input.repositoryKey,
          number: input.number,
          lastViewedAt: input.viewedAt,
          lastNotifiedCommentId: current?.lastNotifiedCommentId ?? null,
        });
      }),
    markNotified: (input) =>
      Effect.sync(() => {
        const key = pullRequestInboxIdentityKey(input.repositoryKey, input.number);
        const current = rows.get(key);
        rows.set(key, {
          repositoryKey: input.repositoryKey,
          number: input.number,
          lastViewedAt: current?.lastViewedAt ?? null,
          lastNotifiedCommentId: input.commentId,
        });
      }),
  };
}

export function loadPullRequestInbox(input: {
  readonly cwd: string;
  readonly repositories: ReadonlySet<string>;
  readonly inventoryIncomplete: boolean;
  readonly github: GitHubCliShape;
  readonly inbox: PullRequestInboxStateShape;
  readonly now: () => string;
  readonly withGitHubRead: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}): Effect.Effect<PullRequestInboxResult, unknown> {
  return Effect.gen(function* () {
    if (input.repositories.size === 0) {
      return { items: [], unreadCount: 0, incomplete: input.inventoryIncomplete };
    }

    const notifications = yield* input.withGitHubRead(
      input.github.listPullRequestInboxNotifications({
        cwd: input.cwd,
        limit: INBOX_NOTIFICATION_LIMIT,
      }),
    );
    const knownRepositories = new Set(
      [...input.repositories].map((repository) => repository.toLowerCase()),
    );
    const candidates = notifications.filter((notification) => {
      if (!notification.unread) return false;
      if (!isQualifyingPullRequestInboxReason(notification.reason)) return false;
      if (!knownRepositories.has(notification.repository.toLowerCase())) return false;
      return notification.latestCommentUrl != null;
    });
    const truncated = notifications.length >= INBOX_NOTIFICATION_LIMIT;

    const comments = yield* Effect.forEach(
      candidates,
      (notification) =>
        input.withGitHubRead(
          input.github.getPullRequestInboxComment({
            cwd: input.cwd,
            commentUrl: notification.latestCommentUrl!,
          }),
        ).pipe(
          Effect.map((comment) => [notification.id, comment] as const),
          Effect.catch(() => Effect.succeed(null)),
        ),
      { concurrency: INBOX_COMMENT_CONCURRENCY },
    );
    const commentsByNotificationId = new Map(
      comments.flatMap((entry) => (entry ? [entry] : [])),
    );

    const humanNotifications = candidates.flatMap((notification) => {
      const comment = commentsByNotificationId.get(notification.id);
      if (!comment) return [];
      if (
        isAutomatedPullRequestCommentAuthor({
          login: comment.authorLogin,
          type: comment.authorType,
        })
      ) {
        return [];
      }
      return [{ notification, comment }];
    });

    const latestByPullRequest = new Map<
      string,
      {
        notification: GitHubPullRequestInboxNotification;
        comment: GitHubPullRequestInboxComment;
      }
    >();
    for (const entry of humanNotifications) {
      const key = pullRequestInboxIdentityKey(entry.notification.repository, entry.notification.number);
      const current = latestByPullRequest.get(key);
      if (!current || Date.parse(entry.notification.updatedAt) >= Date.parse(current.notification.updatedAt)) {
        latestByPullRequest.set(key, entry);
      }
    }

    const persistedRows = yield* input.inbox.list();
    const persistedByKey = new Map(
      persistedRows.map((row) => [pullRequestInboxIdentityKey(row.repositoryKey, row.number), row]),
    );
    const initializedAt = yield* input.inbox.initializedAt();
    const inboxInitialized = initializedAt != null;
    const now = input.now();

    if (!inboxInitialized) {
      yield* input.inbox.markInitialized(now);
      yield* Effect.forEach(
        latestByPullRequest.values(),
        ({ notification, comment }) =>
          input.inbox.markNotified({
            repositoryKey: notification.repository.toLowerCase(),
            number: notification.number,
            commentId: comment.id,
          }),
        { concurrency: 1 },
      );
    }

    const items: PullRequestInboxItem[] = [...latestByPullRequest.values()].map(
      ({ notification, comment }) => {
        const key = pullRequestInboxIdentityKey(notification.repository, notification.number);
        const persisted = persistedByKey.get(key);
        const unread = isPullRequestInboxUnread({
          lastViewedAt: persisted?.lastViewedAt ?? null,
          activityAt: notification.updatedAt,
        });
        return {
          repository: notification.repository,
          number: notification.number,
          title: notification.title,
          url: `https://github.com/${notification.repository}/pull/${notification.number}`,
          updatedAt: notification.updatedAt,
          unread,
          notify: shouldNotifyPullRequestInboxComment({
            unread,
            commentId: comment.id,
            lastNotifiedCommentId: inboxInitialized
              ? (persisted?.lastNotifiedCommentId ?? null)
              : comment.id,
            inboxInitialized,
          }),
          comment: {
            id: comment.id,
            authorLogin: comment.authorLogin,
            bodyPreview: previewPullRequestInboxCommentBody(comment.body),
            createdAt: comment.createdAt,
            url: comment.url,
          },
        };
      },
    );

    items.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return {
      items,
      unreadCount: items.filter((item) => item.unread).length,
      incomplete: input.inventoryIncomplete || truncated,
    };
  });
}

export function markPullRequestInboxViewed(
  inbox: PullRequestInboxStateShape,
  input: PullRequestInboxMarkViewedInput,
  now: () => string,
): Effect.Effect<void, unknown> {
  return inbox.markViewed({
    repositoryKey: input.repository.toLowerCase(),
    number: input.number,
    viewedAt: laterIsoTimestamp(input.viewedAt ?? now(), now()),
  });
}

export function markPullRequestInboxNotified(
  inbox: PullRequestInboxStateShape,
  input: PullRequestInboxMarkNotifiedInput,
): Effect.Effect<void, unknown> {
  return inbox.markNotified({
    repositoryKey: input.repository.toLowerCase(),
    number: input.number,
    commentId: input.commentId,
  });
}
