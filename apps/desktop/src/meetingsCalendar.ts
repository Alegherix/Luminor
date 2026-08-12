import * as FS from "node:fs/promises";
import * as Path from "node:path";

import {
  HttpMeetingsCalendarClient,
  HttpMeetingsOAuthClient,
  runLocalhostLoopbackOAuth,
  type MeetingsAuthorizationCode,
  type MeetingsOAuthClient,
} from "./meetingsCalendarOauth";

export type MeetingsCalendarCredentials = {
  readonly clientId: string;
  readonly clientSecret: string;
};

export type MeetingsCalendarTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
  accountEmail?: string;
};

export type MeetingsCalendarStatus = {
  readonly connected: boolean;
  readonly accountEmail: string | null;
};

export type MeetingsCalendarEvent = {
  readonly id: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly meetUrl: string | null;
  readonly attendees: readonly string[];
};

export type MeetingsCalendarRawEvent = {
  readonly id?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly status?: string;
  readonly hangoutLink?: string;
  readonly location?: string;
  readonly start?: { readonly date?: string; readonly dateTime?: string };
  readonly end?: { readonly date?: string; readonly dateTime?: string };
  readonly conferenceData?: {
    readonly conferenceSolution?: { readonly key?: { readonly type?: string } };
    readonly entryPoints?: ReadonlyArray<{
      readonly entryPointType?: string;
      readonly uri?: string;
    }>;
  };
  readonly attendees?: ReadonlyArray<{
    readonly displayName?: string;
    readonly email?: string;
  }>;
};

export type MeetingsCalendarClient = {
  listEvents(params: {
    accessToken: string;
    calendarId: "primary";
    timeMin: string;
    timeMax: string;
  }): Promise<readonly MeetingsCalendarRawEvent[]>;
};

export type MeetingsCalendarService = {
  getStatus(): Promise<MeetingsCalendarStatus>;
  connect(): Promise<MeetingsCalendarStatus>;
  listToday(): Promise<readonly MeetingsCalendarEvent[]>;
};

export type MeetingsCalendarServiceDeps = {
  readonly homeDir: string;
  readonly now?: () => Date;
  readonly pickClientJson?: () => Promise<string | null>;
  readonly authorize?: (params: {
    credentials: MeetingsCalendarCredentials;
    scopes: readonly string[];
    openExternal: (url: string) => Promise<void> | void;
  }) => Promise<MeetingsAuthorizationCode>;
  readonly openExternal?: (url: string) => Promise<void> | void;
  readonly oauthClient?: MeetingsOAuthClient;
  readonly calendarClient?: MeetingsCalendarClient;
  readonly fetch?: typeof fetch;
};

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const TOKEN_REFRESH_SKEW_MS = 60_000;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export function meetingsCalendarConfigPath(homeDir: string): string {
  return Path.join(homeDir, "config", "google-calendar-oauth.json");
}

export function meetingsCalendarTokenPath(homeDir: string): string {
  return Path.join(homeDir, "auth", "google-calendar-tokens.json");
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseInstalledGoogleOAuthClient(value: unknown): MeetingsCalendarCredentials {
  if (!value || typeof value !== "object") {
    throw new Error("OAuth client JSON must be an object.");
  }
  const record = value as Record<string, unknown>;
  const installed = record.installed;
  if (!installed || typeof installed !== "object") {
    throw new Error("OAuth client JSON must be a Google installed app.");
  }
  const installedRecord = installed as Record<string, unknown>;
  const clientId = nonEmptyString(installedRecord.client_id);
  const clientSecret = nonEmptyString(installedRecord.client_secret);
  if (!clientId || !clientSecret) {
    throw new Error("Installed OAuth client JSON is missing client_id or client_secret.");
  }
  return { clientId, clientSecret };
}

export function localDayRange(now: Date): { timeMin: string; timeMax: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

function isGoogleMeetUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.hostname !== "meet.google.com") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function firstMeetUrlInText(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(/https:\/\/meet\.google\.com\/[^\s<>'"]+/i);
  return isGoogleMeetUrl(match?.[0]);
}

export function extractMeetUrl(event: MeetingsCalendarRawEvent): string | null {
  const hangout = isGoogleMeetUrl(event.hangoutLink);
  if (hangout) {
    return hangout;
  }
  for (const entry of event.conferenceData?.entryPoints ?? []) {
    const uri = isGoogleMeetUrl(entry.uri);
    if (uri) {
      return uri;
    }
  }
  return firstMeetUrlInText(event.location) ?? firstMeetUrlInText(event.description);
}

function mapPrimaryCalendarEvent(event: MeetingsCalendarRawEvent): MeetingsCalendarEvent | null {
  if (event.status === "cancelled") {
    return null;
  }
  const id = nonEmptyString(event.id);
  const startAt = nonEmptyString(event.start?.dateTime);
  const endAt = nonEmptyString(event.end?.dateTime);
  if (!id || !startAt || !endAt) {
    return null;
  }
  const attendees = (event.attendees ?? [])
    .map((attendee) => nonEmptyString(attendee.displayName) ?? nonEmptyString(attendee.email))
    .filter((value): value is string => value !== null);
  return {
    id,
    title: nonEmptyString(event.summary) ?? "(Untitled event)",
    startAt,
    endAt,
    meetUrl: extractMeetUrl(event),
    attendees,
  };
}

export function mapPrimaryCalendarEvents(
  events: readonly MeetingsCalendarRawEvent[],
): MeetingsCalendarEvent[] {
  const mapped: MeetingsCalendarEvent[] = [];
  for (const event of events) {
    const meeting = mapPrimaryCalendarEvent(event);
    if (meeting) {
      mapped.push(meeting);
    }
  }
  return mapped;
}

async function writePrivateFile(filePath: string, contents: string): Promise<void> {
  const directory = Path.dirname(filePath);
  await FS.mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await FS.writeFile(filePath, contents, { encoding: "utf8", mode: PRIVATE_FILE_MODE });
  await FS.chmod(directory, PRIVATE_DIRECTORY_MODE).catch(() => undefined);
  await FS.chmod(filePath, PRIVATE_FILE_MODE).catch(() => undefined);
}

async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await FS.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeToken(value: unknown): MeetingsCalendarTokenSet | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const accessToken = nonEmptyString(record.accessToken);
  if (!accessToken) {
    return null;
  }
  const refreshToken = nonEmptyString(record.refreshToken);
  const expiresAt = nonEmptyString(record.expiresAt);
  const scope = nonEmptyString(record.scope);
  const tokenType = nonEmptyString(record.tokenType);
  const accountEmail = nonEmptyString(record.accountEmail);
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(scope ? { scope } : {}),
    ...(tokenType ? { tokenType } : {}),
    ...(accountEmail ? { accountEmail } : {}),
  };
}

function tokenExpired(token: MeetingsCalendarTokenSet, now: Date): boolean {
  if (!token.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }
  return expiresAt <= now.getTime() + TOKEN_REFRESH_SKEW_MS;
}

function publicStatus(token: MeetingsCalendarTokenSet | null): MeetingsCalendarStatus {
  if (!token) {
    return { connected: false, accountEmail: null };
  }
  return { connected: true, accountEmail: token.accountEmail ?? null };
}

async function readCredentials(homeDir: string): Promise<MeetingsCalendarCredentials | null> {
  const value = await readJsonFile(meetingsCalendarConfigPath(homeDir));
  if (value === null) {
    return null;
  }
  try {
    return parseInstalledGoogleOAuthClient(value);
  } catch {
    return null;
  }
}

async function readToken(homeDir: string): Promise<MeetingsCalendarTokenSet | null> {
  return normalizeToken(await readJsonFile(meetingsCalendarTokenPath(homeDir)));
}

async function writeToken(homeDir: string, token: MeetingsCalendarTokenSet): Promise<void> {
  await writePrivateFile(meetingsCalendarTokenPath(homeDir), `${JSON.stringify(token, null, 2)}\n`);
}

async function installPickedClient(
  homeDir: string,
  pickedPath: string,
): Promise<MeetingsCalendarCredentials> {
  const raw = await FS.readFile(pickedPath, "utf8");
  const credentials = parseInstalledGoogleOAuthClient(JSON.parse(raw));
  await writePrivateFile(meetingsCalendarConfigPath(homeDir), `${raw.trim()}\n`);
  return credentials;
}

export function createMeetingsCalendarService(
  deps: MeetingsCalendarServiceDeps,
): MeetingsCalendarService {
  const now = deps.now ?? (() => new Date());
  const oauthClient = deps.oauthClient ?? new HttpMeetingsOAuthClient(deps.fetch ?? fetch, now);
  const calendarClient = deps.calendarClient ?? new HttpMeetingsCalendarClient(deps.fetch ?? fetch);
  const authorize = deps.authorize ?? runLocalhostLoopbackOAuth;
  const openExternal = deps.openExternal ?? (async () => undefined);
  const pickClientJson = deps.pickClientJson ?? (async () => null);

  const ensureCredentials = async (): Promise<MeetingsCalendarCredentials | null> => {
    const existing = await readCredentials(deps.homeDir);
    if (existing) {
      return existing;
    }
    const pickedPath = await pickClientJson();
    if (!pickedPath) {
      return null;
    }
    return installPickedClient(deps.homeDir, pickedPath);
  };

  const ensureFreshToken = async (
    credentials: MeetingsCalendarCredentials,
    token: MeetingsCalendarTokenSet,
  ): Promise<MeetingsCalendarTokenSet> => {
    if (!tokenExpired(token, now()) || !token.refreshToken) {
      return token;
    }
    const refreshed = await oauthClient.refreshToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken: token.refreshToken,
    });
    const refreshToken = refreshed.refreshToken ?? token.refreshToken;
    const accountEmail = refreshed.accountEmail ?? token.accountEmail;
    const merged: MeetingsCalendarTokenSet = {
      ...token,
      ...refreshed,
      ...(refreshToken ? { refreshToken } : {}),
      ...(accountEmail ? { accountEmail } : {}),
    };
    await writeToken(deps.homeDir, merged);
    return merged;
  };

  return {
    async getStatus() {
      return publicStatus(await readToken(deps.homeDir));
    },

    async connect() {
      const credentials = await ensureCredentials();
      if (!credentials) {
        return publicStatus(null);
      }
      const authorization = await authorize({
        credentials,
        scopes: [GOOGLE_CALENDAR_SCOPE],
        openExternal,
      });
      const token = await oauthClient.exchangeCode({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        code: authorization.code,
        redirectUri: authorization.redirectUri,
        ...(authorization.codeVerifier ? { codeVerifier: authorization.codeVerifier } : {}),
      });
      await writeToken(deps.homeDir, token);
      return publicStatus(token);
    },

    async listToday() {
      const credentials = await readCredentials(deps.homeDir);
      const token = await readToken(deps.homeDir);
      if (!credentials || !token) {
        return [];
      }
      const fresh = await ensureFreshToken(credentials, token);
      const events = await calendarClient.listEvents({
        accessToken: fresh.accessToken,
        calendarId: "primary",
        ...localDayRange(now()),
      });
      return mapPrimaryCalendarEvents(events);
    },
  };
}
