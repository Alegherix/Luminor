import { existsSync } from "node:fs";

const WAYLAND_SOCKET_NAMES = ["wayland-1", "wayland-0"] as const;

export function withLinuxWaylandDisplay(
  env: NodeJS.ProcessEnv,
  socketExists: (path: string) => boolean,
): NodeJS.ProcessEnv {
  if ((env.WAYLAND_DISPLAY ?? "").trim() !== "") {
    return env;
  }

  const runtimeDir = (env.XDG_RUNTIME_DIR ?? "").trim();
  if (runtimeDir === "") {
    return env;
  }

  for (const name of WAYLAND_SOCKET_NAMES) {
    if (socketExists(`${runtimeDir}/${name}`)) {
      return { ...env, WAYLAND_DISPLAY: name };
    }
  }

  return env;
}

export function resolveElectronOzonePlatformHint(env: NodeJS.ProcessEnv): string | undefined {
  const hinted = (env.ELECTRON_OZONE_PLATFORM_HINT ?? "").trim();
  if (hinted !== "") {
    return hinted;
  }
  if ((env.WAYLAND_DISPLAY ?? "").trim() !== "") {
    return "wayland";
  }
  return undefined;
}

export function applyLinuxElectronDisplayEnvironment(
  env: NodeJS.ProcessEnv,
  options: {
    platform?: NodeJS.Platform;
    socketExists?: (path: string) => boolean;
    appendSwitch?: (name: string, value?: string) => void;
  } = {},
): void {
  if ((options.platform ?? process.platform) !== "linux") {
    return;
  }

  const next = withLinuxWaylandDisplay(env, options.socketExists ?? existsSync);
  if (next.WAYLAND_DISPLAY && env.WAYLAND_DISPLAY !== next.WAYLAND_DISPLAY) {
    env.WAYLAND_DISPLAY = next.WAYLAND_DISPLAY;
  }

  const hint = resolveElectronOzonePlatformHint(env);
  if (!hint) {
    return;
  }

  env.ELECTRON_OZONE_PLATFORM_HINT = hint;
  options.appendSwitch?.("ozone-platform-hint", hint);
}
