import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { sanitizeMeetingSessionId } from "./meetingsRecording";

export type MeetingsHistoryEvent = {
  readonly id: string;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly meetUrl: string | null;
  readonly attendees: readonly string[];
};

type RecordingMetadata = {
  readonly sessionId?: string;
  readonly meetingTitle?: string;
  readonly meetingStartAt?: string;
  readonly meetingEndAt?: string;
  readonly meetingMeetUrl?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly calendarEventId?: string;
};

const FOLDER_INSTANT = /(\d{8}T\d{6}Z)/g;

export function discoverMeetingsHistoryRoots(input: {
  readonly homeDir: string;
  readonly userHome?: string;
  readonly env?: NodeJS.ProcessEnv;
}): string[] {
  const userHome = input.userHome ?? OS.homedir();
  const env = input.env ?? process.env;
  const xdg = env.XDG_CONFIG_HOME?.trim() || Path.join(userHome, ".config");
  const seen = new Set<string>();
  const roots: string[] = [];

  const add = (directory: string) => {
    const resolved = Path.resolve(directory);
    if (seen.has(resolved) || !isDirectory(resolved)) {
      return;
    }
    seen.add(resolved);
    roots.push(resolved);
  };

  add(Path.join(input.homeDir, "meetings"));
  add(Path.join(xdg, "@missiondeck", "desktop", "meetings"));
  add(Path.join(xdg, "@onetui", "desktop", "meetings"));
  addProfileMeetings(Path.join(xdg, "@missiondeck", "desktop-dev"), add);
  addProfileMeetings(Path.join(xdg, "@onetui", "desktop-dev"), add);
  return roots;
}

export function resolveMeetingSessionDir(input: {
  readonly homeDir: string;
  readonly sessionId: string;
  readonly userHome?: string;
  readonly env?: NodeJS.ProcessEnv;
}): string | null {
  const names = new Set([sanitizeMeetingSessionId(input.sessionId), input.sessionId]);
  let best: string | null = null;
  let bestRank = -1;
  for (const root of discoverMeetingsHistoryRoots(input)) {
    for (const name of names) {
      const directory = Path.join(root, name);
      if (!isDirectory(directory)) {
        continue;
      }
      const rank =
        (findHistoryTranscriptPath(directory) !== null ? 2 : 0) +
        (newestMatchingFile(Path.join(directory, "recordings"), (file) =>
          file.endsWith(".webm"),
        ) !== null
          ? 1
          : 0);
      if (rank > bestRank) {
        best = directory;
        bestRank = rank;
      }
    }
  }
  return best;
}

export async function listMeetingsHistory(input: {
  readonly homeDir: string;
  readonly userHome?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<readonly MeetingsHistoryEvent[]> {
  const byId = new Map<string, { event: MeetingsHistoryEvent; rank: number }>();
  for (const root of discoverMeetingsHistoryRoots(input)) {
    let entries: FS.Dirent[];
    try {
      entries = await FS.promises.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const parsed = await parseHistorySession(Path.join(root, entry.name));
      if (parsed === null) {
        continue;
      }
      const existing = byId.get(parsed.event.id);
      if (existing === undefined || parsed.rank > existing.rank) {
        byId.set(parsed.event.id, parsed);
      }
    }
  }
  return [...byId.values()]
    .map((item) => item.event)
    .toSorted((left, right) => Date.parse(right.startAt) - Date.parse(left.startAt));
}

export function findHistoryTranscriptPath(sessionDir: string): string | null {
  const transcriptsDir = Path.join(sessionDir, "transcripts");
  const luminorText = Path.join(transcriptsDir, "transcript.txt");
  if (isFile(luminorText)) {
    return luminorText;
  }
  const luminorJson = Path.join(transcriptsDir, "transcript.json");
  if (isFile(luminorJson)) {
    return luminorJson;
  }
  return newestMatchingFile(transcriptsDir, (name) => {
    if (name.endsWith(".metadata.json")) {
      return false;
    }
    return name.endsWith(".json") || name.endsWith(".md") || name.endsWith(".txt");
  });
}

export function findHistoryNotesPath(sessionDir: string): string | null {
  const besideTranscript = Path.join(sessionDir, "transcripts", "notes.md");
  if (isFile(besideTranscript)) {
    return besideTranscript;
  }
  const atRoot = Path.join(sessionDir, "notes.md");
  return isFile(atRoot) ? atRoot : null;
}

export function findHistorySummaryPath(sessionDir: string): string | null {
  const besideTranscript = Path.join(sessionDir, "transcripts", "summary.md");
  if (isFile(besideTranscript)) {
    return besideTranscript;
  }
  const atRoot = Path.join(sessionDir, "summary.md");
  return isFile(atRoot) ? atRoot : null;
}

function addProfileMeetings(desktopDev: string, add: (directory: string) => void): void {
  let entries: FS.Dirent[];
  try {
    entries = FS.readdirSync(desktopDev, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      add(Path.join(desktopDev, entry.name, "meetings"));
    }
  }
}

async function parseHistorySession(
  sessionDir: string,
): Promise<{ event: MeetingsHistoryEvent; rank: number } | null> {
  const folderName = Path.basename(sessionDir);
  const metadata = await bestRecordingMetadata(sessionDir);
  const transcriptPath = findHistoryTranscriptPath(sessionDir);
  const recordingPath = newestMatchingFile(Path.join(sessionDir, "recordings"), (name) =>
    name.endsWith(".webm"),
  );
  const folderInstants = parseFolderInstants(folderName);
  const startAt =
    readInstant(metadata?.meetingStartAt) ??
    readInstant(metadata?.startedAt) ??
    folderInstants.startAt ??
    instantFromRecordingName(recordingPath);
  if (startAt === null) {
    return null;
  }
  const title = metadata?.meetingTitle?.trim() || null;
  if (title === null && transcriptPath === null && recordingPath === null) {
    return null;
  }
  if (title === null && !folderName.startsWith("gcal-") && !folderName.startsWith("pasted")) {
    return null;
  }
  const endAt =
    readInstant(metadata?.meetingEndAt) ??
    readInstant(metadata?.endedAt) ??
    folderInstants.endAt ??
    startAt;
  const id = metadata?.sessionId?.trim() || folderName;
  const rank =
    (title !== null ? 4 : 0) + (transcriptPath !== null ? 2 : 0) + (recordingPath !== null ? 1 : 0);
  return {
    rank,
    event: {
      id,
      title: title ?? fallbackTitle(folderName, startAt),
      startAt,
      endAt,
      meetUrl: metadata?.meetingMeetUrl?.trim() || null,
      attendees: [],
    },
  };
}

async function bestRecordingMetadata(sessionDir: string): Promise<RecordingMetadata | null> {
  const recordingsDir = Path.join(sessionDir, "recordings");
  let names: string[];
  try {
    names = await FS.promises.readdir(recordingsDir);
  } catch {
    return null;
  }
  let best: RecordingMetadata | null = null;
  let bestScore = -1;
  for (const name of names) {
    if (!name.endsWith(".metadata.json")) {
      continue;
    }
    const parsed = await readJsonFile(Path.join(recordingsDir, name));
    if (parsed === null) {
      continue;
    }
    const score = parsed.meetingTitle ? 2 : 1;
    if (score > bestScore) {
      best = parsed;
      bestScore = score;
    }
  }
  return best;
}

async function readJsonFile(path: string): Promise<RecordingMetadata | null> {
  try {
    const parsed: unknown = JSON.parse(await FS.promises.readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const value = parsed as Record<string, unknown>;
    return {
      ...(readString(value.sessionId) ? { sessionId: readString(value.sessionId) } : {}),
      ...(readString(value.meetingTitle) ? { meetingTitle: readString(value.meetingTitle) } : {}),
      ...(readString(value.meetingStartAt)
        ? { meetingStartAt: readString(value.meetingStartAt) }
        : {}),
      ...(readString(value.meetingEndAt) ? { meetingEndAt: readString(value.meetingEndAt) } : {}),
      ...(readString(value.meetingMeetUrl)
        ? { meetingMeetUrl: readString(value.meetingMeetUrl) }
        : {}),
      ...(readString(value.startedAt) ? { startedAt: readString(value.startedAt) } : {}),
      ...(readString(value.endedAt) ? { endedAt: readString(value.endedAt) } : {}),
      ...(readString(value.calendarEventId)
        ? { calendarEventId: readString(value.calendarEventId) }
        : {}),
    };
  } catch {
    return null;
  }
}

function parseFolderInstants(folderName: string): {
  startAt: string | null;
  endAt: string | null;
} {
  const matches = [...folderName.matchAll(FOLDER_INSTANT)].map((match) => match[1] ?? "");
  const startAt = compactFolderInstant(matches[0] ?? null);
  const endAt = compactFolderInstant(matches[1] ?? null);
  return { startAt, endAt };
}

function compactFolderInstant(value: string | null): string | null {
  if (value === null || !/^\d{8}T\d{6}Z$/.test(value)) {
    return null;
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.000Z`;
}

function instantFromRecordingName(path: string | null): string | null {
  if (path === null) {
    return null;
  }
  const name = Path.basename(path);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(\d{3})Z/.exec(name);
  if (match === null) {
    return null;
  }
  const compact = match[1] ?? "";
  const ms = match[2] ?? "000";
  return `${compact.slice(0, 13)}:${compact.slice(14, 16)}:${compact.slice(17, 19)}.${ms}Z`;
}

function readInstant(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function fallbackTitle(folderName: string, startAt: string): string {
  if (folderName.startsWith("pasted")) {
    return "Pasted meeting";
  }
  return `Meeting ${startAt.slice(0, 10)}`;
}

function newestMatchingFile(directory: string, match: (name: string) => boolean): string | null {
  let names: string[];
  try {
    names = FS.readdirSync(directory);
  } catch {
    return null;
  }
  let newest: string | null = null;
  let newestMtime = Number.NEGATIVE_INFINITY;
  for (const name of names) {
    if (!match(name)) {
      continue;
    }
    const path = Path.join(directory, name);
    try {
      const stat = FS.statSync(path);
      if (!stat.isFile()) {
        continue;
      }
      if (stat.mtimeMs >= newestMtime) {
        newest = path;
        newestMtime = stat.mtimeMs;
      }
    } catch {}
  }
  return newest;
}

function isDirectory(path: string): boolean {
  try {
    return FS.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return FS.statSync(path).isFile();
  } catch {
    return false;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
