export function pullRequestInboxIdentityKey(repository: string, number: number): string {
  return `${repository.trim().toLowerCase()}#${number}`;
}

const AUTOMATED_COMMENT_LOGINS = new Set([
  "github-actions",
  "github-actions[bot]",
  "dependabot",
  "dependabot[bot]",
  "renovate",
  "renovate[bot]",
  "codecov",
  "codecov[bot]",
  "imgbot",
  "imgbot[bot]",
]);

const QUALIFYING_INBOX_REASONS = new Set(["comment", "mention", "author"]);

export function isAutomatedPullRequestCommentAuthor(input: {
  login: string | null | undefined;
  type?: string | null;
}): boolean {
  const login = input.login?.trim().toLowerCase() ?? "";
  if (login.length === 0) return false;
  if (input.type?.trim().toLowerCase() === "bot") return true;
  if (login.endsWith("[bot]")) return true;
  return AUTOMATED_COMMENT_LOGINS.has(login);
}

export function isQualifyingPullRequestInboxReason(reason: string): boolean {
  return QUALIFYING_INBOX_REASONS.has(reason.trim().toLowerCase());
}

export function parsePullRequestFromNotificationSubject(input: {
  type: string | null | undefined;
  url: string | null | undefined;
  repository: string | null | undefined;
}): { repository: string; number: number } | null {
  if (input.type?.trim() !== "PullRequest") return null;
  const repository = input.repository?.trim() ?? "";
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/.test(repository)) {
    return null;
  }
  const url = input.url?.trim() ?? "";
  const match = /\/pulls\/(\d+)(?:\?|#|$)/.exec(url);
  const number = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(number) || number <= 0) return null;
  return { repository, number };
}

export function parseGitHubCommentApiPath(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? "";
  const match =
    /^https:\/\/api\.github\.com\/(repos\/[^/?#]+\/[^/?#]+\/(?:issues|pulls)\/comments\/\d+)(?:[?#].*)?$/i.exec(
      trimmed,
    );
  return match?.[1] ?? null;
}

export function isPullRequestInboxUnread(input: {
  lastViewedAt: string | null;
  activityAt: string;
}): boolean {
  if (input.lastViewedAt == null) return true;
  const activityMs = Date.parse(input.activityAt);
  const viewedMs = Date.parse(input.lastViewedAt);
  if (!Number.isFinite(activityMs) || !Number.isFinite(viewedMs)) return true;
  return activityMs > viewedMs;
}

export function shouldNotifyPullRequestInboxComment(input: {
  unread: boolean;
  commentId: string;
  lastNotifiedCommentId: string | null;
  inboxInitialized: boolean;
}): boolean {
  if (!input.unread || !input.inboxInitialized) return false;
  return input.lastNotifiedCommentId !== input.commentId;
}

export function laterIsoTimestamp(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs)) return right;
  if (!Number.isFinite(rightMs)) return left;
  return rightMs > leftMs ? right : left;
}
