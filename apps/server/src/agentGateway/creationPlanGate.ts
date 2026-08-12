export function isGatewayTurnStateTerminal(state: string | null | undefined): boolean {
  return state === "idle" || state === "completed" || state === "error" || state === "interrupted";
}

export function parseCreatedThreadIds(resultJson: string | null): ReadonlyArray<string> {
  if (resultJson === null || resultJson.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(resultJson);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const threadIds = (parsed as { threadIds?: unknown }).threadIds;
    if (!Array.isArray(threadIds)) return [];
    return threadIds.filter((threadId): threadId is string => typeof threadId === "string");
  } catch {
    return [];
  }
}

export function previousCreationPlanBlocksNextWave(status: string): boolean {
  return status !== "completed";
}

export function previousWaveNeedsTerminalThreads(input: {
  readonly requestedCount: number;
  readonly resultJson: string | null;
}): boolean {
  return parseCreatedThreadIds(input.resultJson).length < input.requestedCount;
}
