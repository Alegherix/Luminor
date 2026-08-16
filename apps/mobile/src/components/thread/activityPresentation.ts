import type { OrchestrationThreadActivity } from "@luminor/contracts";

export type ActivityIconKind = "success" | "tool" | "approval" | "error" | "info";

export type ActivityPresentation = {
  readonly title: string;
  readonly body: string | null;
  readonly icon: ActivityIconKind;
  readonly success: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

export function presentActivity(activity: OrchestrationThreadActivity): ActivityPresentation {
  const payload = asRecord(activity.payload);
  const title = activity.summary.trim() || activity.kind;
  const detail = firstString(payload?.detail, payload?.description, payload?.path);
  const payloadSummary = firstString(payload?.summary);
  const body =
    detail && detail !== title
      ? detail
      : payloadSummary && payloadSummary !== title
        ? payloadSummary
        : null;
  const success =
    activity.tone !== "error" &&
    (/\.(completed|passed)$/.test(activity.kind) ||
      /passed|success|completed/i.test(activity.summary));
  const icon: ActivityIconKind =
    activity.tone === "error" || activity.kind.includes("error")
      ? "error"
      : activity.tone === "approval" || activity.kind.startsWith("approval.")
        ? "approval"
        : success
          ? "success"
          : activity.tone === "tool" || activity.kind.startsWith("tool.")
            ? "tool"
            : "info";
  return { title, body, icon, success };
}
