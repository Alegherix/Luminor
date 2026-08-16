export type ResourceProcessGroup = "app" | "agents" | "background" | "leftovers";

export type ResourceProcessStatus = "running" | "idle" | "stale" | "dead";

export type ResourceProcessKind =
  | "luminor"
  | "electron-helper"
  | "vite"
  | "grok"
  | "codex"
  | "cursor-agent"
  | "claude"
  | "codegraph"
  | "agentmemory-mcp"
  | "repomix-mcp"
  | "serena"
  | "context-mode"
  | "iii"
  | "ollama"
  | "openclaw"
  | "agentmemory"
  | "codex-desktop"
  | "webpack"
  | "gradle"
  | "other";

export interface ResourceProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly rssKb: number;
  readonly cpu: number;
  readonly elapsedSeconds: number;
  readonly comm: string;
  readonly args: string;
}

export interface ClassifiedResourceProcess {
  readonly row: ResourceProcessRow;
  readonly kind: ResourceProcessKind;
  readonly name: string;
  readonly detail: string;
  readonly project: string;
  readonly group: ResourceProcessGroup;
  readonly status: ResourceProcessStatus;
  readonly canStop: boolean;
  readonly fingerprint: string;
}

export interface ResourceProcessLeaf {
  readonly id: string;
  readonly pid: number;
  readonly pids: readonly number[];
  readonly fingerprints: readonly string[];
  readonly name: string;
  readonly detail: string;
  readonly project: string;
  readonly group: ResourceProcessGroup;
  readonly status: ResourceProcessStatus;
  readonly cpu: number;
  readonly rssMb: number;
  readonly canStop: boolean;
}

export interface ResourceProcessTreeGroup {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly project: string;
  readonly group: ResourceProcessGroup;
  readonly status: ResourceProcessStatus;
  readonly cpu: number;
  readonly rssMb: number;
  readonly canStop: boolean;
  readonly children: readonly ResourceProcessLeaf[];
}

export interface ResourceProcessTree {
  readonly groups: readonly ResourceProcessTreeGroup[];
  readonly totalCpu: number;
  readonly totalRssMb: number;
  readonly processCount: number;
}

export interface ClassifyResourceProcessesInput {
  readonly rows: readonly ResourceProcessRow[];
  readonly selfPid: number;
  readonly selfCwd?: string;
}

const STALE_AFTER_SECONDS = 3 * 60 * 60;
const DEAD_TOOL_AFTER_SECONDS = 60 * 60;

export function resourceProcessFingerprint(row: Pick<ResourceProcessRow, "pid" | "comm" | "args">): string {
  return `${row.pid}:${row.comm}:${row.args.slice(0, 180)}`;
}

export function formatResourceRss(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

export function formatResourceCpu(cpu: number): string {
  if (cpu < 0.05) return "0.0%";
  return `${cpu.toFixed(1)}%`;
}

export function resourceProcessTone(
  status: ResourceProcessStatus,
  rssMb: number,
  cpu: number,
): "muted" | "warning" | "danger" {
  if (status === "dead") return "danger";
  if (status === "stale" || rssMb >= 1500 || cpu >= 12) return "warning";
  return "muted";
}

function lower(value: string): string {
  return value.toLowerCase();
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function detectResourceProcessKind(row: ResourceProcessRow): ResourceProcessKind {
  const args = lower(row.args);
  const comm = lower(row.comm);
  if (includesAny(args, ["gradledaemon", "gradle-daemon"]) || comm.includes("java") && args.includes("gradle")) {
    return "gradle";
  }
  if (comm === "webpack" || /(^|[\s/])webpack(\s|$)/.test(args)) {
    return "webpack";
  }
  if (includesAny(args, ["llama-server", "ollama"]) || comm.includes("ollama") || comm.includes("llama-server")) {
    return "ollama";
  }
  if (/(^|[\s/])iii(\s|$)/.test(args) || comm === "iii") {
    return "iii";
  }
  if (args.includes("openclaw") || comm.includes("openclaw")) {
    return "openclaw";
  }
  if (args.includes("agentmemory/mcp") || args.includes("agentmemory-mcp") || args.includes("@agentmemory/mcp")) {
    return "agentmemory-mcp";
  }
  if ((args.includes("/bin/agentmemory") || comm === "agentmemory") && !args.includes("mcp")) {
    return "agentmemory";
  }
  if (args.includes("repomix") && args.includes("mcp")) {
    return "repomix-mcp";
  }
  if (args.includes("serena start-mcp") || (comm === "serena" && args.includes("mcp"))) {
    return "serena";
  }
  if (args.includes("context-mode")) {
    return "context-mode";
  }
  if (args.includes("codegraph")) {
    return "codegraph";
  }
  if (args.includes("cursor-agent") || comm.includes("cursor-agent")) {
    return "cursor-agent";
  }
  if (args.includes("grok --") || /(^|[\s/])grok(\s|$)/.test(args) && args.includes("permission-mode")) {
    return "grok";
  }
  if (args.includes("codex app-server") || (comm === "codex" && args.includes("app-server"))) {
    return "codex";
  }
  if (args.includes("/usr/lib/chatgpt") || comm === "chatgpt") {
    return "codex-desktop";
  }
  if (args.includes("vite") && (args.includes("apps/web") || args.includes("--port") || comm.includes("vite"))) {
    return "vite";
  }
  if (
    comm.includes("luminor") ||
    args.includes("apps/server/src/index.ts") ||
    args.includes("apps/server/dist/index") ||
    (comm.includes("electron") && args.includes("luminor"))
  ) {
    return "luminor";
  }
  if (comm.includes("electron") && args.includes("--type=")) {
    return "electron-helper";
  }
  if (args.includes("claude") && (args.includes("cli") || args.includes("agent"))) {
    return "claude";
  }
  return "other";
}

function projectForKind(kind: ResourceProcessKind): string {
  switch (kind) {
    case "luminor":
    case "electron-helper":
    case "vite":
    case "grok":
    case "codex":
    case "cursor-agent":
    case "claude":
    case "codegraph":
    case "agentmemory-mcp":
    case "repomix-mcp":
    case "serena":
    case "context-mode":
      return "Luminor";
    case "iii":
    case "agentmemory":
      return "AgentMemory";
    case "ollama":
      return "Ollama";
    case "openclaw":
      return "OpenClaw";
    case "codex-desktop":
      return "Codex";
    case "webpack":
      return "Unknown frontend";
    case "gradle":
      return "Unknown Java project";
    default:
      return "Host";
  }
}

function nameForKind(kind: ResourceProcessKind): string {
  switch (kind) {
    case "luminor":
      return "Luminor";
    case "electron-helper":
      return "Renderer";
    case "vite":
      return "Vite";
    case "grok":
      return "Grok";
    case "codex":
      return "Codex app-server";
    case "cursor-agent":
      return "Cursor agent";
    case "claude":
      return "Claude";
    case "codegraph":
      return "CodeGraph";
    case "agentmemory-mcp":
      return "AgentMemory MCP";
    case "repomix-mcp":
      return "Repomix MCP";
    case "serena":
      return "Serena";
    case "context-mode":
      return "context-mode";
    case "iii":
      return "iii";
    case "ollama":
      return "Ollama";
    case "openclaw":
      return "OpenClaw";
    case "agentmemory":
      return "AgentMemory";
    case "codex-desktop":
      return "Codex desktop";
    case "webpack":
      return "webpack";
    case "gradle":
      return "Gradle daemon";
    default:
      return "Process";
  }
}

function statusFor(kind: ResourceProcessKind, cpu: number, elapsedSeconds: number): ResourceProcessStatus {
  if (kind === "webpack" || kind === "gradle") {
    return elapsedSeconds >= DEAD_TOOL_AFTER_SECONDS || cpu < 0.2 ? "dead" : "stale";
  }
  if (elapsedSeconds >= STALE_AFTER_SECONDS && cpu < 0.6) return "stale";
  if (cpu < 0.2) return "idle";
  return "running";
}

function belongsToSelf(
  row: ResourceProcessRow,
  kind: ResourceProcessKind,
  selfPid: number,
  ancestorPids: ReadonlySet<number>,
  selfCwd: string | undefined,
): boolean {
  if (row.pid === selfPid || ancestorPids.has(row.pid)) return true;
  if (selfCwd && row.args.includes(selfCwd) && (kind === "luminor" || kind === "vite")) return true;
  return false;
}

export function classifyResourceProcesses(
  input: ClassifyResourceProcessesInput,
): ClassifiedResourceProcess[] {
  const ancestorPids = collectDescendantPids(input.rows, input.selfPid);
  ancestorPids.add(input.selfPid);

  const classified = input.rows
    .filter((row) => {
      const kind = detectResourceProcessKind(row);
      if (kind === "other") return ancestorPids.has(row.pid);
      if (kind === "electron-helper") return ancestorPids.has(row.pid);
      return true;
    })
    .map((row) => {
      const kind = detectResourceProcessKind(row);
      const selfOwned = belongsToSelf(row, kind, input.selfPid, ancestorPids, input.selfCwd);
      const status = statusFor(kind, row.cpu, row.elapsedSeconds);
      const canStop = row.pid !== input.selfPid && !selfOwned;
      const group: ResourceProcessGroup = selfOwned
        ? "app"
        : kind === "webpack" || kind === "gradle"
          ? "leftovers"
          : kind === "iii" ||
              kind === "ollama" ||
              kind === "openclaw" ||
              kind === "agentmemory" ||
              kind === "codex-desktop"
            ? "background"
            : "agents";
      return {
        row,
        kind,
        name: nameForKind(kind === "other" ? "luminor" : kind),
        detail: detailFor(row, kind, selfOwned),
        project: selfOwned ? "Luminor" : projectForKind(kind),
        group,
        status,
        canStop,
        fingerprint: resourceProcessFingerprint(row),
      } satisfies ClassifiedResourceProcess;
    });

  return markDuplicateLeftovers(classified);
}

function detailFor(row: ResourceProcessRow, kind: ResourceProcessKind, selfOwned: boolean): string {
  if (selfOwned && kind === "luminor") return "This instance";
  if (kind === "vite") {
    const port = row.args.match(/--port[=\s](\d+)/)?.[1];
    return port ? `:${port}` : "Vite";
  }
  if (kind === "webpack") return "Idle frontend bundler";
  if (kind === "gradle") return "Idle Java daemon";
  if (kind === "iii") return "AgentMemory engine";
  if (kind === "codegraph") return "Index server";
  if (row.elapsedSeconds >= STALE_AFTER_SECONDS) {
    return `Idle ${Math.max(1, Math.round(row.elapsedSeconds / 3600))}h`;
  }
  return nameForKind(kind);
}

function collectDescendantPids(rows: readonly ResourceProcessRow[], rootPid: number): Set<number> {
  const children = new Map<number, number[]>();
  for (const row of rows) {
    const list = children.get(row.ppid) ?? [];
    list.push(row.pid);
    children.set(row.ppid, list);
  }
  const seen = new Set<number>();
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (pid === undefined || seen.has(pid)) continue;
    seen.add(pid);
    for (const child of children.get(pid) ?? []) stack.push(child);
  }
  return seen;
}

function markDuplicateLeftovers(
  processes: readonly ClassifiedResourceProcess[],
): ClassifiedResourceProcess[] {
  const keepKinds: ResourceProcessKind[] = [
    "agentmemory-mcp",
    "repomix-mcp",
    "serena",
    "context-mode",
    "codegraph",
    "vite",
    "codex",
    "grok",
  ];
  const extras = new Set<number>();
  for (const kind of keepKinds) {
    const matches = processes
      .filter((item) => item.kind === kind && item.group !== "app")
      .toSorted((left, right) => left.row.elapsedSeconds - right.row.elapsedSeconds);
    for (const extra of matches.slice(1)) extras.add(extra.row.pid);
  }
  return processes.map((item) => {
    if (!extras.has(item.row.pid)) return item;
    return {
      ...item,
      group: "leftovers",
      status: "dead",
      detail: "Copy from a settled thread",
      canStop: true,
    };
  });
}

export function buildResourceProcessTree(
  processes: readonly ClassifiedResourceProcess[],
): ResourceProcessTree {
  const groups: ResourceProcessTreeGroup[] = [];
  const order: readonly ResourceProcessGroup[] = ["app", "agents", "background", "leftovers"];
  const titles: Record<ResourceProcessGroup, { name: string; detail: string; project: string }> = {
    app: { name: "Luminor", detail: "This app", project: "Luminor" },
    agents: { name: "Agents", detail: "Provider runtimes and tools", project: "Luminor" },
    background: { name: "On this machine", detail: "Not started from this window", project: "Host" },
    leftovers: { name: "Leftovers", detail: "Idle, duplicate, or detached", project: "Host" },
  };

  for (const group of order) {
    const members = processes.filter((item) => item.group === group);
    if (members.length === 0) continue;
    const leaves = collapseLeaves(members, group);
    const cpu = leaves.reduce((sum, leaf) => sum + leaf.cpu, 0);
    const rssMb = leaves.reduce((sum, leaf) => sum + leaf.rssMb, 0);
    groups.push({
      id: group,
      ...titles[group],
      group,
      status: group === "leftovers" ? "dead" : group === "background" ? "stale" : "running",
      cpu,
      rssMb,
      canStop: leaves.some((leaf) => leaf.canStop),
      children: leaves,
    });
  }

  const leaves = groups.flatMap((group) => group.children);
  return {
    groups,
    totalCpu: leaves.reduce((sum, leaf) => sum + leaf.cpu, 0),
    totalRssMb: leaves.reduce((sum, leaf) => sum + leaf.rssMb, 0),
    processCount: leaves.reduce((sum, leaf) => sum + leaf.pids.length, 0),
  };
}

function collapseLeaves(
  members: readonly ClassifiedResourceProcess[],
  group: ResourceProcessGroup,
): ResourceProcessLeaf[] {
  if (group !== "leftovers") {
    return members.map((item) => toLeaf(item));
  }
  const byKind = new Map<ResourceProcessKind, ClassifiedResourceProcess[]>();
  for (const item of members) {
    const list = byKind.get(item.kind) ?? [];
    list.push(item);
    byKind.set(item.kind, list);
  }
  const leaves: ResourceProcessLeaf[] = [];
  for (const [kind, list] of byKind) {
    if (list.length === 1 || kind === "webpack" || kind === "gradle" || kind === "vite") {
      for (const item of list) leaves.push(toLeaf(item));
      continue;
    }
    const cpu = list.reduce((sum, item) => sum + item.row.cpu, 0);
    const rssMb = list.reduce((sum, item) => sum + item.row.rssKb / 1024, 0);
    const first = list[0];
    if (!first) continue;
    leaves.push({
      id: `bundle:${kind}`,
      pid: first.row.pid,
      pids: list.map((item) => item.row.pid),
      fingerprints: list.map((item) => item.fingerprint),
      name: `${first.name} ×${list.length}`,
      detail: "Copies from settled threads",
      project: first.project,
      group,
      status: "dead",
      cpu,
      rssMb,
      canStop: true,
    });
  }
  return leaves.toSorted((left, right) => right.rssMb - left.rssMb);
}

function toLeaf(item: ClassifiedResourceProcess): ResourceProcessLeaf {
  return {
    id: String(item.row.pid),
    pid: item.row.pid,
    pids: [item.row.pid],
    fingerprints: [item.fingerprint],
    name: item.name,
    detail: item.detail,
    project: item.project,
    group: item.group,
    status: item.status,
    cpu: item.row.cpu,
    rssMb: item.row.rssKb / 1024,
    canStop: item.canStop,
  };
}
