const PASTED_MEET_HOST = "meet.google.com";
const PASTED_MEET_CODE_PATTERN = /^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\/|$)/i;

export const INVALID_MEET_URL_MESSAGE = "That is not a Google Meet link.";
export const MISSING_MEET_URL_MESSAGE = "This meeting has no Google Meet link.";

function candidateUrlFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (/^meet\.google\.com\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function parsedCandidateUrl(input: string): URL | null {
  const candidate = candidateUrlFromInput(input);
  if (!candidate) {
    return null;
  }
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

export function extractMeetCode(input: string): string | null {
  const parsed = parsedCandidateUrl(input);
  if (!parsed || parsed.hostname.toLowerCase() !== PASTED_MEET_HOST) {
    return null;
  }
  const match = parsed.pathname.match(PASTED_MEET_CODE_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
}

export function normalizePastedMeetUrl(input: string): string | null {
  const parsed = parsedCandidateUrl(input);
  if (!parsed) {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== PASTED_MEET_HOST) {
    return null;
  }
  if (parsed.username || parsed.password || parsed.port) {
    return null;
  }
  const meetCode = extractMeetCode(input);
  if (!meetCode) {
    return null;
  }
  return `https://${PASTED_MEET_HOST}/${meetCode}`;
}

export function isGoogleMeetJoinUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === PASTED_MEET_HOST;
  } catch {
    return false;
  }
}

export function pastedMeetingSessionId(meetUrl: string): string | null {
  const code = extractMeetCode(meetUrl);
  return code === null ? null : `pasted:${code}`;
}

export function pastedMeetingTitle(meetUrl: string): string {
  const code = extractMeetCode(meetUrl);
  return code === null ? "Pasted Meet" : `Meet ${code}`;
}
