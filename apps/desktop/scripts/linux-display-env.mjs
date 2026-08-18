import { existsSync } from "node:fs";
import { join } from "node:path";

const WAYLAND_SOCKET_NAMES = ["wayland-1", "wayland-0"];

export function applyLinuxElectronDisplayEnvironment(env) {
  if (process.platform !== "linux") {
    return env;
  }

  if (!String(env.WAYLAND_DISPLAY ?? "").trim() && env.XDG_RUNTIME_DIR) {
    for (const name of WAYLAND_SOCKET_NAMES) {
      if (existsSync(join(env.XDG_RUNTIME_DIR, name))) {
        env.WAYLAND_DISPLAY = name;
        break;
      }
    }
  }

  if (!String(env.ELECTRON_OZONE_PLATFORM_HINT ?? "").trim() && env.WAYLAND_DISPLAY) {
    env.ELECTRON_OZONE_PLATFORM_HINT = "wayland";
  }

  return env;
}
