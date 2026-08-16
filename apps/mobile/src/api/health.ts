import { errorMessageFromBody, HttpRequestError, requestJson } from "./http";
import { makeHealthUrl } from "./urls";

export type HealthSnapshot = {
  readonly status: string;
  readonly startupReady: boolean | null;
  readonly pushBusReady: boolean | null;
  readonly projectionState: string | null;
};

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function fetchHealth(baseUrl: string, signal?: AbortSignal): Promise<HealthSnapshot> {
  const response = await requestJson({
    url: makeHealthUrl(baseUrl),
    method: "GET",
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new HttpRequestError(
      errorMessageFromBody(response.body, `Health check failed with status ${response.status}`),
      response.status,
      response.body,
    );
  }
  const body = response.body;
  if (!body || typeof body !== "object") {
    throw new HttpRequestError(
      "Health check returned an unreadable payload.",
      response.status,
      body,
    );
  }
  const record = body as Record<string, unknown>;
  const projection =
    record.projection && typeof record.projection === "object"
      ? (record.projection as Record<string, unknown>)
      : null;
  return {
    status: readOptionalString(record.status) ?? "ok",
    startupReady: readOptionalBoolean(record.startupReady),
    pushBusReady: readOptionalBoolean(record.pushBusReady),
    projectionState: projection ? readOptionalString(projection.state) : null,
  };
}
