import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  ServerListResourceProcessesResult,
  ServerStopResourceProcessInput,
  ServerStopResourceProcessResult,
} from "@luminor/contracts";
import {
  buildResourceProcessTree,
  classifyResourceProcesses,
  resourceProcessFingerprint,
  type ResourceProcessRow,
} from "@luminor/shared/resourceProcesses";

import { redactSensitiveProcessArgs } from "./processArgumentRedaction";

const execFileAsync = promisify(execFile);
const PROCESS_OUTPUT_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const STOP_SIGNAL_SETTLE_MS = 450;

function emptySnapshot(): ServerListResourceProcessesResult {
  return {
    generatedAt: new Date().toISOString(),
    supported: false,
    totalCpu: 0,
    totalRssMb: 0,
    processCount: 0,
    groups: [],
  };
}

export function parseResourceProcessTable(output: string): ResourceProcessRow[] {
  const rows: ResourceProcessRow[] = [];
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([0-9.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const rssKb = Number(match[3]);
    const cpu = Number(match[4]);
    const elapsedSeconds = Number(match[5]);
    const comm = match[6] ?? "";
    const args = redactSensitiveProcessArgs((match[7] ?? "").trim());
    if (!Number.isFinite(pid) || pid <= 0) continue;
    rows.push({
      pid,
      ppid: Number.isFinite(ppid) ? ppid : 1,
      rssKb: Number.isFinite(rssKb) ? rssKb : 0,
      cpu: Number.isFinite(cpu) ? cpu : 0,
      elapsedSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
      comm,
      args,
    });
  }
  return rows;
}

async function readProcessTable(): Promise<ResourceProcessRow[]> {
  if (process.platform === "win32") return [];
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,rss=,pcpu=,etimes=,comm=,args="], {
    maxBuffer: PROCESS_OUTPUT_MAX_BUFFER_BYTES,
    timeout: 4_000,
  });
  return parseResourceProcessTable(stdout);
}

export async function listResourceProcesses(): Promise<ServerListResourceProcessesResult> {
  if (process.platform === "win32") return emptySnapshot();
  try {
    const rows = await readProcessTable();
    const classified = classifyResourceProcesses({
      rows,
      selfPid: process.pid,
      selfCwd: process.cwd(),
    });
    const tree = buildResourceProcessTree(classified);
    return {
      generatedAt: new Date().toISOString(),
      supported: true,
      totalCpu: tree.totalCpu,
      totalRssMb: tree.totalRssMb,
      processCount: tree.processCount,
      groups: tree.groups,
    };
  } catch (error) {
    console.error("[resourceProcessMonitor] failed to list processes", error);
    return emptySnapshot();
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function stopResourceProcess(
  input: ServerStopResourceProcessInput,
): Promise<ServerStopResourceProcessResult> {
  const snapshot = await listResourceProcesses();
  const leaves = snapshot.groups.flatMap((group) => group.children);
  const allowed = new Map<number, string>();
  for (const leaf of leaves) {
    if (!leaf.canStop) continue;
    for (let index = 0; index < leaf.pids.length; index += 1) {
      const pid = leaf.pids[index];
      const fingerprint = leaf.fingerprints[index];
      if (pid !== undefined && fingerprint !== undefined) {
        allowed.set(pid, fingerprint);
      }
    }
  }

  const stoppedPids: number[] = [];
  const failedPids: number[] = [];
  const requested = input.pids.map((pid, index) => ({
    pid,
    fingerprint: input.fingerprints[index] ?? resourceProcessFingerprint({ pid, comm: "", args: "" }),
  }));

  for (const target of requested) {
    const expected = allowed.get(target.pid);
    if (expected === undefined || expected !== target.fingerprint) {
      failedPids.push(target.pid);
      continue;
    }
    if (target.pid === process.pid) {
      failedPids.push(target.pid);
      continue;
    }
    try {
      process.kill(target.pid, "SIGTERM");
    } catch {
      failedPids.push(target.pid);
    }
  }

  await delay(STOP_SIGNAL_SETTLE_MS);
  for (const target of requested) {
    if (failedPids.includes(target.pid)) continue;
    if (isProcessAlive(target.pid)) {
      try {
        process.kill(target.pid, "SIGKILL");
      } catch {
        failedPids.push(target.pid);
        continue;
      }
      await delay(120);
    }
    if (isProcessAlive(target.pid)) failedPids.push(target.pid);
    else stoppedPids.push(target.pid);
  }

  const uniqueFailed = [...new Set(failedPids)];
  const uniqueStopped = [...new Set(stoppedPids)].filter((pid) => !uniqueFailed.includes(pid));
  return {
    stoppedPids: uniqueStopped,
    failedPids: uniqueFailed,
    message:
      uniqueFailed.length === 0
        ? uniqueStopped.length === 1
          ? "Stopped."
          : `Stopped ${uniqueStopped.length} processes.`
        : uniqueStopped.length === 0
          ? "Those processes could not be stopped."
          : `Stopped ${uniqueStopped.length}; ${uniqueFailed.length} could not be stopped.`,
  };
}

export async function stopResourceLeftovers(): Promise<ServerStopResourceProcessResult> {
  const snapshot = await listResourceProcesses();
  const leftovers = snapshot.groups.find((group) => group.group === "leftovers");
  const pids = leftovers?.children.flatMap((leaf) => leaf.pids) ?? [];
  const fingerprints = leftovers?.children.flatMap((leaf) => leaf.fingerprints) ?? [];
  if (pids.length === 0) {
    return { stoppedPids: [], failedPids: [], message: "No leftover processes." };
  }
  return stopResourceProcess({ pids, fingerprints });
}
