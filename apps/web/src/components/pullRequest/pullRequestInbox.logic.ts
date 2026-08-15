import type { PullRequestInboxItem, PullRequestListEntry } from "@luminor/contracts";
import { pullRequestInboxIdentityKey } from "@luminor/shared/pullRequestInbox";

export function indexPullRequestInboxItems(
  items: ReadonlyArray<PullRequestInboxItem>,
): Map<string, PullRequestInboxItem> {
  return new Map(
    items.map((item) => [pullRequestInboxIdentityKey(item.repository, item.number), item]),
  );
}

export function pullRequestListEntryIsUnread(
  entry: Pick<PullRequestListEntry, "repository" | "number">,
  inboxByIdentity: ReadonlyMap<string, PullRequestInboxItem>,
): boolean {
  return (
    inboxByIdentity.get(pullRequestInboxIdentityKey(entry.repository, entry.number))?.unread ===
    true
  );
}

export function buildPullRequestInboxNotificationCopy(item: PullRequestInboxItem): {
  title: string;
  body: string;
} {
  const author = item.comment?.authorLogin?.trim() || "Someone";
  const preview = item.comment?.bodyPreview.trim() ?? "";
  return {
    title: `${author} commented on #${item.number}`,
    body: preview.length > 0 ? `${item.title}: ${preview}` : item.title,
  };
}

export const PULL_REQUEST_INBOX_NOTIFICATION_ACTION_PREFIX = "notification-open-pull-request:";

export function pullRequestInboxNotificationAction(
  item: Pick<PullRequestInboxItem, "repository" | "number">,
): string {
  return `${PULL_REQUEST_INBOX_NOTIFICATION_ACTION_PREFIX}${item.repository}#${item.number}`;
}

export function parsePullRequestInboxNotificationAction(
  action: string,
): { repository: string; number: number } | null {
  if (!action.startsWith(PULL_REQUEST_INBOX_NOTIFICATION_ACTION_PREFIX)) return null;
  const raw = action.slice(PULL_REQUEST_INBOX_NOTIFICATION_ACTION_PREFIX.length);
  const separator = raw.lastIndexOf("#");
  if (separator <= 0) return null;
  const repository = raw.slice(0, separator).trim();
  const number = Number(raw.slice(separator + 1));
  if (repository.length === 0 || !Number.isInteger(number) || number <= 0) return null;
  return { repository, number };
}
