import { execFile as nodeExecFile } from "node:child_process";

export const MEETINGS_LOOPBACK_SOURCE_PREFIX = "luminor_loopback_";
export const MEETINGS_LOOPBACK_DESCRIPTION = "Luminor_Loopback";
const DEFAULT_TIMEOUT_MS = 2000;

export type MeetingsLoopbackModule = {
  readonly moduleId: string;
  readonly sourceName: string;
  readonly description: string;
  readonly master: string;
};

export type MeetingsLoopbackResult = {
  readonly ok: boolean;
  readonly module?: MeetingsLoopbackModule;
  readonly modules?: readonly MeetingsLoopbackModule[];
  readonly error?: string;
};

export type MeetingsLoopbackExecFile = (
  file: string,
  args: readonly string[],
  options: { timeout?: number },
) => Promise<{ stdout: string }>;

export type MeetingsLoopbackDeps = {
  readonly execFile?: MeetingsLoopbackExecFile;
  readonly timeoutMs?: number;
  readonly pid?: number;
};

type PactlOutcome = {
  readonly stdout: string;
  readonly error?: { readonly code: string; readonly message: string };
};

function defaultExecFile(
  file: string,
  args: readonly string[],
  options: { timeout?: number },
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    nodeExecFile(
      file,
      [...args],
      { timeout: options.timeout, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          const errno = error as NodeJS.ErrnoException;
          reject({
            code: errno.code ?? "EUNKNOWN",
            message: errno.message,
          });
          return;
        }
        resolve({ stdout });
      },
    );
  });
}

async function runPactl(
  args: readonly string[],
  deps: MeetingsLoopbackDeps,
): Promise<PactlOutcome> {
  const exec = deps.execFile ?? defaultExecFile;
  const timeout = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const { stdout } = await exec("pactl", args, { timeout });
    return { stdout };
  } catch (error) {
    const record = (error ?? {}) as { code?: string; message?: string };
    return {
      stdout: "",
      error: {
        code: typeof record.code === "string" ? record.code : "EUNKNOWN",
        message: typeof record.message === "string" ? record.message : String(error),
      },
    };
  }
}

function pactlError(label: string, outcome: PactlOutcome): string {
  if (!outcome.error) {
    return "";
  }
  if (outcome.error.code === "ENOENT") {
    return "pactl unavailable";
  }
  return `${label}: ${outcome.error.code} ${outcome.error.message}`.trim();
}

export function parseDefaultSink(infoStdout: string): string | null {
  for (const raw of infoStdout.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("Default Sink:")) {
      const value = line.slice("Default Sink:".length).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function parseModuleArg(args: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = args.match(new RegExp(`(?:^|\\s|=)${escaped}=([^\\s]+)`));
  return match?.[1] ?? "";
}

export function parseLoopbackModules(stdout: string): MeetingsLoopbackModule[] {
  const modules: MeetingsLoopbackModule[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) {
      continue;
    }
    const [moduleId, moduleName, args = ""] = line.split("\t");
    const id = moduleId ?? "";
    if (!/^\d+$/.test(id) || moduleName !== "module-remap-source") {
      continue;
    }
    const sourceName = parseModuleArg(args, "source_name");
    const description = parseModuleArg(args, "device.description");
    const master = parseModuleArg(args, "master");
    if (
      !sourceName.startsWith(MEETINGS_LOOPBACK_SOURCE_PREFIX) &&
      description !== MEETINGS_LOOPBACK_DESCRIPTION
    ) {
      continue;
    }
    modules.push({
      moduleId: id,
      sourceName,
      description,
      master,
    });
  }
  return modules;
}

export async function listMeetingsLoopbacks(
  deps: MeetingsLoopbackDeps = {},
): Promise<MeetingsLoopbackResult> {
  const outcome = await runPactl(["list", "short", "modules"], deps);
  if (outcome.error) {
    return { ok: false, modules: [], error: pactlError("list loopbacks", outcome) };
  }
  return { ok: true, modules: parseLoopbackModules(outcome.stdout) };
}

export async function loadMeetingsLoopback(
  deps: MeetingsLoopbackDeps = {},
): Promise<MeetingsLoopbackResult> {
  const pid = deps.pid ?? process.pid;
  const sourceName = `${MEETINGS_LOOPBACK_SOURCE_PREFIX}${String(pid)}`;
  const existing = await listMeetingsLoopbacks(deps);
  if (!existing.ok) {
    return existing;
  }
  const duplicate = existing.modules?.find((module) => module.sourceName === sourceName);
  if (duplicate) {
    return { ok: true, module: duplicate, modules: existing.modules ?? [] };
  }

  const info = await runPactl(["info"], deps);
  if (info.error) {
    return { ok: false, error: pactlError("info", info) };
  }
  const defaultSink = parseDefaultSink(info.stdout);
  if (!defaultSink) {
    return { ok: false, error: "missing default sink from pactl info" };
  }

  const master = `${defaultSink}.monitor`;
  const load = await runPactl(
    [
      "load-module",
      "module-remap-source",
      `master=${master}`,
      `source_name=${sourceName}`,
      `source_properties=device.description=${MEETINGS_LOOPBACK_DESCRIPTION}`,
    ],
    deps,
  );
  if (load.error) {
    return { ok: false, error: pactlError("load loopback", load) };
  }
  const moduleId = load.stdout.trim();
  if (!/^\d+$/.test(moduleId)) {
    return { ok: false, error: `unexpected module id from pactl: ${moduleId || "(empty)"}` };
  }
  const module: MeetingsLoopbackModule = {
    moduleId,
    sourceName,
    description: MEETINGS_LOOPBACK_DESCRIPTION,
    master,
  };
  return { ok: true, module, modules: [...(existing.modules ?? []), module] };
}

export async function unloadMeetingsLoopback(
  moduleId: string,
  deps: MeetingsLoopbackDeps = {},
): Promise<MeetingsLoopbackResult> {
  if (!/^\d+$/.test(moduleId)) {
    return { ok: false, error: "invalid loopback module id: digits only" };
  }
  const listed = await listMeetingsLoopbacks(deps);
  if (!listed.ok) {
    return listed;
  }
  if (!listed.modules?.some((module) => module.moduleId === moduleId)) {
    return {
      ok: false,
      modules: listed.modules ?? [],
      error: `module ${moduleId} is not a Luminor loopback`,
    };
  }
  const unload = await runPactl(["unload-module", moduleId], deps);
  if (unload.error) {
    return {
      ok: false,
      modules: listed.modules ?? [],
      error: pactlError("unload loopback", unload),
    };
  }
  return {
    ok: true,
    modules: (listed.modules ?? []).filter((module) => module.moduleId !== moduleId),
  };
}
