export type OrphanedUserInputQuestion = {
  readonly id: string;
  readonly header: string;
  readonly question: string;
};

export type OrphanedUserInputAnswers = Readonly<
  Record<string, string | ReadonlyArray<string> | null>
>;

const ORPHANED_USER_INPUT_DELIVERY_FAILURE_PHRASES = [
  "no persisted provider binding exists",
  "no provider session thread is bound",
  "no active provider session is bound",
] as const;

const TERMINAL_USER_INPUT_SESSION_STATUSES = new Set(["interrupted", "stopped", "error"]);

export function isOrphanedUserInputDeliveryFailure(detail: string | undefined): boolean {
  if (!detail) {
    return false;
  }
  const normalized = detail.toLowerCase();
  return ORPHANED_USER_INPUT_DELIVERY_FAILURE_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function shouldContinueOrphanedUserInputAsTurn(input: {
  readonly sessionStatus: string | null | undefined;
  readonly failureDetail?: string;
}): boolean {
  if (
    input.sessionStatus != null &&
    TERMINAL_USER_INPUT_SESSION_STATUSES.has(input.sessionStatus)
  ) {
    return true;
  }
  return isOrphanedUserInputDeliveryFailure(input.failureDetail);
}

function formatAnswerValue(value: string | ReadonlyArray<string> | null): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const parts = value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function formatOrphanedUserInputContinuation(input: {
  readonly questions?: ReadonlyArray<OrphanedUserInputQuestion>;
  readonly answers: OrphanedUserInputAnswers;
}): string {
  const questionsById = new Map((input.questions ?? []).map((question) => [question.id, question]));
  const lines: string[] = [];
  const seenIds = new Set<string>();

  for (const question of input.questions ?? []) {
    const formatted = formatAnswerValue(input.answers[question.id] ?? null);
    if (formatted === null) {
      continue;
    }
    seenIds.add(question.id);
    lines.push(`- ${question.header}: ${formatted}`);
  }

  for (const [id, value] of Object.entries(input.answers)) {
    if (seenIds.has(id)) {
      continue;
    }
    const formatted = formatAnswerValue(value);
    if (formatted === null) {
      continue;
    }
    const header = questionsById.get(id)?.header ?? id;
    lines.push(`- ${header}: ${formatted}`);
  }

  return [
    "The previous turn asked for input, but that session is no longer running. Continue with these answers:",
    "",
    ...lines,
  ].join("\n");
}
