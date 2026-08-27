// FILE: processTreeKiller.ts
// Purpose: Captures and terminates PTY process trees without losing reparented children.
// Layer: Terminal infrastructure utility
// Depends on: node child_process, process signals, and tree-kill.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import treeKill from "tree-kill";

const PROCESS_TREE_SCAN_TIMEOUT_MS = 1_000;
// Full-system `ps` output scales with host process count and command-line
// length (Electron helpers alone run to kilobytes per line); an undersized cap
// makes snapshot failure routine on busy machines.
const PROCESS_TREE_SCAN_MAX_BUFFER_BYTES = 8_388_608;
const PROCESS_COMMAND_SCAN_MAX_BUFFER_BYTES = 8_388_608;
const POSIX_TREE_WALK_MAX_VISITED = 256;

export type ProcessChildrenMap = Map<number, Array<CapturedProcess>>;
export type ProcessCommandMap = Map<number, string>;
/** Linux `/proc/<pid>/stat` starttime (field 22), keyed by pid. */
export type ProcessStartTimeMap = Map<number, string>;

export interface CapturedProcess {
  pid: number;
  command: string;
  /**
   * Stable process identity across `exec()` cmdline changes. On Linux this is
   * `/proc/<pid>/stat` starttime; absent when the platform cannot provide it.
   */
  startTime?: string;
}

export interface CapturedProcessTree {
  descendants: CapturedProcess[];
  /** False when the platform process snapshot failed and descendant absence is unproven. */
  captureComplete?: boolean;
}

export interface CapturedProcessTreeInspection {
  /** False when the process table could not be read, so exit cannot be proven. */
  verified: boolean;
  survivors: CapturedProcess[];
}

export type TerminalKillSignal = "SIGTERM" | "SIGKILL";

export interface ProcessTreeKiller {
  capture(rootPid: number): CapturedProcessTree;
  inspect?(tree: CapturedProcessTree): CapturedProcessTreeInspection;
  signal(input: {
    rootPid: number;
    signal: TerminalKillSignal;
    tree: CapturedProcessTree;
    includeRootTree?: boolean | undefined;
    onError: (error: Error, context: { pid: number; source: "tree-kill" | "captured" }) => void;
  }): void;
}

export interface ProcessTreeKillerDependencies {
  captureChildrenMap: () => ProcessChildrenMap | null;
  readCurrentCommands: (pids: readonly number[]) => ProcessCommandMap | null;
  readCurrentStartTimes?: (pids: readonly number[]) => ProcessStartTimeMap | null;
  signalPid: (pid: number, signal: TerminalKillSignal) => Error | null;
  signalTree: (
    rootPid: number,
    signal: TerminalKillSignal,
    callback: (error?: Error | null) => void,
  ) => void;
}

/**
 * Parse Linux `/proc/<pid>/stat` starttime (field 22). Returns null when the
 * record is missing or malformed — callers must fall back to cmdline matching.
 */
export function parseProcStatStartTime(statContents: string): string | null {
  const closeParen = statContents.lastIndexOf(")");
  if (closeParen < 0) return null;
  const fields = statContents.slice(closeParen + 2).trim().split(/\s+/);
  // After comm: state(3) … starttime(22) ⇒ zero-based index 19.
  const startTime = fields[19];
  return startTime && /^\d+$/.test(startTime) ? startTime : null;
}

function readProcStartTime(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    return parseProcStatStartTime(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return null;
  }
}

function readCurrentStartTimes(pids: readonly number[]): ProcessStartTimeMap | null {
  if (globalThis.process.platform !== "linux") return new Map();
  const uniquePids = [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
  const startTimes: ProcessStartTimeMap = new Map();
  for (const pid of uniquePids) {
    const startTime = readProcStartTime(pid);
    if (startTime !== null) startTimes.set(pid, startTime);
  }
  return startTimes;
}

function attachStartTimes(processes: CapturedProcess[]): CapturedProcess[] {
  if (globalThis.process.platform !== "linux" || processes.length === 0) return processes;
  return processes.map((process) => {
    if (process.startTime !== undefined) return process;
    const startTime = readProcStartTime(process.pid);
    return startTime === null ? process : { ...process, startTime };
  });
}

export function parseProcessChildrenMap(psOutput: string): ProcessChildrenMap {
  const childrenByParentPid: ProcessChildrenMap = new Map();
  for (const line of psOutput.split(/\r?\n/g)) {
    const [pidRaw, ppidRaw, ...commandParts] = line.trim().split(/\s+/g);
    const pid = Number(pidRaw);
    const ppid = Number(ppidRaw);
    const command = commandParts.join(" ").trim();
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    if (command.length === 0) continue;
    const siblings = childrenByParentPid.get(ppid) ?? [];
    siblings.push({ pid, command });
    childrenByParentPid.set(ppid, siblings);
  }
  return childrenByParentPid;
}

export function parseProcessCommandMap(psOutput: string): ProcessCommandMap {
  const commandsByPid: ProcessCommandMap = new Map();
  for (const line of psOutput.split(/\r?\n/g)) {
    const match = /^\s*(\d+)\s+(.*\S)\s*$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const command = match[2]?.trim() ?? "";
    if (!Number.isInteger(pid) || command.length === 0) continue;
    commandsByPid.set(pid, command);
  }
  return commandsByPid;
}

export function collectDescendantProcesses(
  parentPid: number,
  childrenByParentPid: ProcessChildrenMap,
): CapturedProcess[] {
  const descendants: CapturedProcess[] = [];
  const stack = [...(childrenByParentPid.get(parentPid) ?? [])].reverse();
  const visited = new Set<number>([parentPid]);

  while (stack.length > 0 && descendants.length < POSIX_TREE_WALK_MAX_VISITED) {
    const child = stack.pop();
    if (!child || visited.has(child.pid)) {
      continue;
    }
    visited.add(child.pid);
    descendants.push(child);

    const nestedChildren = childrenByParentPid.get(child.pid) ?? [];
    for (const nestedChild of [...nestedChildren].reverse()) {
      stack.push(nestedChild);
    }
  }

  return descendants;
}

function captureProcessChildrenMapSync(): ProcessChildrenMap | null {
  try {
    const result = spawnSync("ps", ["-eo", "pid=,ppid=,command="], {
      encoding: "utf8",
      maxBuffer: PROCESS_TREE_SCAN_MAX_BUFFER_BYTES,
      timeout: PROCESS_TREE_SCAN_TIMEOUT_MS,
    });
    if (result.error || result.status !== 0) return null;
    return parseProcessChildrenMap(result.stdout);
  } catch {
    return null;
  }
}

function readCurrentCommands(pids: readonly number[]): ProcessCommandMap | null {
  const uniquePids = [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
  if (uniquePids.length === 0) return new Map();
  try {
    const result = spawnSync("ps", ["-p", uniquePids.join(","), "-o", "pid=,command="], {
      encoding: "utf8",
      maxBuffer: PROCESS_COMMAND_SCAN_MAX_BUFFER_BYTES,
      timeout: PROCESS_TREE_SCAN_TIMEOUT_MS,
    });
    if (result.error) return null;
    if (result.status !== 0) return new Map();
    return parseProcessCommandMap(result.stdout);
  } catch {
    return null;
  }
}

function signalPid(pid: number, signal: TerminalKillSignal): Error | null {
  try {
    globalThis.process.kill(pid, signal);
    return null;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ESRCH") {
      return null;
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Decide whether a delayed SIGKILL still targets the captured process.
 *
 * Command-line matching alone is wrong for provider MCP helpers: `npm exec`
 * often `exec()`s into `node …/agentmemory-mcp` under the same PID, which must
 * still be killed. Prefer starttime identity when available; fall back to
 * cmdline equality only when starttime was never captured.
 */
export function isSameCapturedProcess(
  process: CapturedProcess,
  currentCommands: ProcessCommandMap | null,
  currentStartTimes: ProcessStartTimeMap | null,
): boolean {
  if (currentCommands === null) return false;
  const currentCommand = currentCommands.get(process.pid);
  if (currentCommand === undefined) return false;
  if (process.startTime !== undefined) {
    if (currentStartTimes === null) return false;
    return currentStartTimes.get(process.pid) === process.startTime;
  }
  return currentCommand === process.command;
}

function shouldSignalCapturedProcess(
  process: CapturedProcess,
  signal: TerminalKillSignal,
  currentCommands: ProcessCommandMap | null,
  currentStartTimes: ProcessStartTimeMap | null,
): boolean {
  if (signal !== "SIGKILL") {
    return true;
  }
  return isSameCapturedProcess(process, currentCommands, currentStartTimes);
}

function capturedProcessesForSignal(
  descendants: readonly CapturedProcess[],
  signal: TerminalKillSignal,
  readCommands: (pids: readonly number[]) => ProcessCommandMap | null,
  readStartTimes: (pids: readonly number[]) => ProcessStartTimeMap | null,
): CapturedProcess[] {
  if (signal !== "SIGKILL") {
    return [...descendants];
  }
  const pids = descendants.map((descendant) => descendant.pid);
  const currentCommands = readCommands(pids);
  const currentStartTimes = readStartTimes(pids);
  return descendants.filter((descendant) =>
    shouldSignalCapturedProcess(descendant, signal, currentCommands, currentStartTimes),
  );
}

// Creates an injectable killer so tests can exercise PID-reuse safeguards safely.
export function createProcessTreeKiller(
  dependencies: Partial<ProcessTreeKillerDependencies> = {},
): ProcessTreeKiller {
  const deps: ProcessTreeKillerDependencies = {
    captureChildrenMap: captureProcessChildrenMapSync,
    readCurrentCommands,
    readCurrentStartTimes,
    signalPid,
    signalTree: treeKill,
    ...dependencies,
  };
  const readStartTimes = deps.readCurrentStartTimes ?? (() => new Map());

  return {
    capture: (rootPid) => {
      if (!Number.isInteger(rootPid) || rootPid <= 0) {
        return { descendants: [], captureComplete: false };
      }
      if (globalThis.process.platform === "win32") {
        // tree-kill delegates to taskkill /T on Windows, which owns descendant traversal.
        return { descendants: [], captureComplete: true };
      }
      const childrenByParentPid = deps.captureChildrenMap();
      if (!childrenByParentPid) return { descendants: [], captureComplete: false };
      return {
        descendants: attachStartTimes(collectDescendantProcesses(rootPid, childrenByParentPid)),
        captureComplete: true,
      };
    },
    inspect: (tree) => {
      if (tree.descendants.length === 0) {
        return { verified: true, survivors: [] };
      }
      const pids = tree.descendants.map((descendant) => descendant.pid);
      const currentCommands = deps.readCurrentCommands(pids);
      if (currentCommands === null) {
        return { verified: false, survivors: [...tree.descendants] };
      }
      const currentStartTimes = readStartTimes(pids);
      return {
        verified: true,
        survivors: tree.descendants.filter((descendant) =>
          isSameCapturedProcess(descendant, currentCommands, currentStartTimes),
        ),
      };
    },
    signal: ({ rootPid, signal, tree, includeRootTree = true, onError }) => {
      // Signal captured descendants directly as well as through tree-kill. If
      // the PTY root exits, those children may be reparented before escalation.
      const capturedProcesses = capturedProcessesForSignal(
        tree.descendants,
        signal,
        deps.readCurrentCommands,
        readStartTimes,
      );
      for (const descendant of capturedProcesses.toReversed()) {
        const error = deps.signalPid(descendant.pid, signal);
        if (error) {
          onError(error, { pid: descendant.pid, source: "captured" });
        }
      }
      if (includeRootTree) {
        deps.signalTree(rootPid, signal, (err) => {
          if (err) {
            onError(err, { pid: rootPid, source: "tree-kill" });
          }
        });
      }
    },
  };
}

export const defaultProcessTreeKiller: ProcessTreeKiller = createProcessTreeKiller();
