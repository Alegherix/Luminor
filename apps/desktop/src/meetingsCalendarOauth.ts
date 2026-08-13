import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type {
  MeetingsCalendarClient,
  MeetingsCalendarCredentials,
  MeetingsCalendarRawEvent,
  MeetingsCalendarTokenSet,
} from "./meetingsCalendar";

export type MeetingsAuthorizationCode = {
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier?: string;
};

export type MeetingsOAuthClient = {
  exchangeCode(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<MeetingsCalendarTokenSet>;
  refreshToken(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<MeetingsCalendarTokenSet>;
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars";
const DEFAULT_EVENTS_FIELDS =
  "items(id,status,summary,description,start,end,hangoutLink,location,conferenceData,attendees(displayName,email))";
const OAUTH_TIMEOUT_MS = 120_000;
const STATE_RANDOM_BYTES = 16;
const VERIFIER_RANDOM_BYTES = 32;

type GoogleOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

function base64Url(input: Buffer): string {
  return input.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function tokenFromResponse(
  response: GoogleOAuthTokenResponse,
  now: Date,
): MeetingsCalendarTokenSet {
  if (!response.access_token) {
    throw new Error(response.error_description ?? response.error ?? "OAuth token missing");
  }
  const token: MeetingsCalendarTokenSet = {
    accessToken: response.access_token,
    ...(response.token_type ? { tokenType: response.token_type } : {}),
    ...(response.scope ? { scope: response.scope } : {}),
  };
  if (response.refresh_token) {
    token.refreshToken = response.refresh_token;
  }
  if (typeof response.expires_in === "number" && Number.isFinite(response.expires_in)) {
    token.expiresAt = new Date(now.getTime() + response.expires_in * 1000).toISOString();
  }
  return token;
}

export class HttpMeetingsOAuthClient implements MeetingsOAuthClient {
  constructor(
    private readonly fetchLike: typeof fetch,
    private readonly now: () => Date,
  ) {}

  async exchangeCode(params: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<MeetingsCalendarTokenSet> {
    const body = new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    });
    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }
    return this.requestToken(body);
  }

  async refreshToken(params: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<MeetingsCalendarTokenSet> {
    return this.requestToken(
      new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        grant_type: "refresh_token",
        refresh_token: params.refreshToken,
      }),
    );
  }

  private async requestToken(body: URLSearchParams): Promise<MeetingsCalendarTokenSet> {
    const response = await this.fetchLike(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await response.json()) as GoogleOAuthTokenResponse;
    if (!response.ok) {
      throw new Error(json.error_description ?? json.error ?? "OAuth exchange failed");
    }
    return tokenFromResponse(json, this.now());
  }
}

export class HttpMeetingsCalendarClient implements MeetingsCalendarClient {
  constructor(private readonly fetchLike: typeof fetch) {}

  async listEvents(params: {
    accessToken: string;
    calendarId: "primary";
    timeMin: string;
    timeMax: string;
  }): Promise<readonly MeetingsCalendarRawEvent[]> {
    const url = new URL(`${GOOGLE_CALENDAR_EVENTS_URL}/${params.calendarId}/events`);
    url.searchParams.set("timeMin", params.timeMin);
    url.searchParams.set("timeMax", params.timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("fields", DEFAULT_EVENTS_FIELDS);
    const response = await this.fetchLike(url.toString(), {
      headers: { authorization: `Bearer ${params.accessToken}` },
    });
    const json = (await response.json()) as { items?: MeetingsCalendarRawEvent[] };
    if (!response.ok) {
      throw new Error("Google Calendar events request failed");
    }
    return Array.isArray(json.items) ? json.items : [];
  }
}

function requestUrl(req: IncomingMessage): URL | null {
  if (!req.url) {
    return null;
  }
  try {
    return new URL(req.url, "http://localhost");
  } catch {
    return null;
  }
}

function writeLoopbackResponse(res: ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

export async function runLocalhostLoopbackOAuth(params: {
  credentials: MeetingsCalendarCredentials;
  scopes: readonly string[];
  openExternal: (url: string) => Promise<void> | void;
}): Promise<MeetingsAuthorizationCode> {
  const state = base64Url(randomBytes(STATE_RANDOM_BYTES));
  const codeVerifier = base64Url(randomBytes(VERIFIER_RANDOM_BYTES));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());

  let resolveCode: (value: MeetingsAuthorizationCode) => void = () => undefined;
  let rejectCode: (reason?: unknown) => void = () => undefined;
  const codePromise = new Promise<MeetingsAuthorizationCode>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((req, res) => {
    const url = requestUrl(req);
    if (!url || url.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const returnedState = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error) {
      writeLoopbackResponse(
        res,
        "Google Calendar authorization failed. You can close this window.",
      );
      rejectCode(new Error(error));
      return;
    }
    if (!code || returnedState !== state) {
      writeLoopbackResponse(res, "Invalid Google Calendar authorization response.");
      rejectCode(new Error("invalid OAuth response"));
      return;
    }
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    writeLoopbackResponse(res, "Google Calendar connected. You can close this window.");
    resolveCode({
      code,
      redirectUri: `http://localhost:${port}/callback`,
      codeVerifier,
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const redirectUri = `http://localhost:${port}/callback`;
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", params.credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", params.scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const timeout = setTimeout(() => {
    rejectCode(new Error("Google Calendar authorization timed out"));
  }, OAUTH_TIMEOUT_MS);

  try {
    await params.openExternal(authUrl.toString());
    return await codePromise;
  } finally {
    clearTimeout(timeout);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
