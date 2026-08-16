export class HttpRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
    this.body = body;
  }
}

export async function readJsonBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}

export async function requestJson(input: {
  readonly url: string;
  readonly method?: "GET" | "POST";
  readonly bearerToken?: string;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly cache?: "default" | "no-store";
}): Promise<{ readonly status: number; readonly ok: boolean; readonly body: unknown }> {
  const headers: Record<string, string> = {};
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (input.bearerToken !== undefined && input.bearerToken.length > 0) {
    headers.Authorization = `Bearer ${input.bearerToken}`;
  }
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.cache ? { cache: input.cache } : {}),
  });
  const body = await readJsonBody(response);
  return { status: response.status, ok: response.ok, body };
}
