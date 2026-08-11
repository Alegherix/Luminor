import { stripTerminalControlSequences } from "./previewOutput";

const MAX_PREVIEW_URL_TAIL_LENGTH = 4096;
const PREVIEW_URL_PATTERN =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{1,5})?(?:\/[^\s]*)?/iu;
const ERROR_LINE_PATTERN = /\b(?:error|exception|failed|failure|refused|unable|cannot)\b/iu;
const TRAILING_URL_PUNCTUATION_PATTERN = /[),.;'"\]}]+$/u;

export interface PreviewUrlDetectionResult {
  readonly tail: string;
  readonly url: string | null;
}

const normalizeDetectedUrl = (url: string): string =>
  url
    .replace(TRAILING_URL_PUNCTUATION_PATTERN, "")
    .replace(/^https?:\/\/0\.0\.0\.0(?=[:/]|$)/iu, (origin) =>
      origin.replace("0.0.0.0", "localhost"),
    );

export function detectPreviewUrl(tail: string, chunk: string): PreviewUrlDetectionResult {
  const nextTail = `${tail}${chunk}`.slice(-MAX_PREVIEW_URL_TAIL_LENGTH);
  const lines = stripTerminalControlSequences(nextTail).split(/\r?\n|\r/u);

  for (const line of lines) {
    if (ERROR_LINE_PATTERN.test(line)) {
      continue;
    }
    const match = PREVIEW_URL_PATTERN.exec(line);
    if (match) {
      return { tail: nextTail, url: normalizeDetectedUrl(match[0]) };
    }
  }

  return { tail: nextTail, url: null };
}
