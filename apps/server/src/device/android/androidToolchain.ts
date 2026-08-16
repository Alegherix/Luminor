import { existsSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

export interface AndroidToolchain {
  readonly sdkRoot: string | null;
  readonly adbPath: string | null;
  readonly emulatorPath: string | null;
  readonly avdHome: string;
  readonly scrcpyServerPath: string | null;
}

export interface AndroidToolchainProbeOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly exists?: (candidate: string) => boolean;
}

const SCRCPY_SERVER_CANDIDATES = [
  "/usr/share/scrcpy/scrcpy-server",
  "/usr/local/share/scrcpy/scrcpy-server",
  "/opt/homebrew/share/scrcpy/scrcpy-server",
];

function executableName(platform: NodeJS.Platform, name: string): string {
  return platform === "win32" ? `${name}.exe` : name;
}

function firstExisting(
  candidates: readonly (string | undefined)[],
  exists: (candidate: string) => boolean,
): string | null {
  for (const candidate of candidates) {
    if (candidate && candidate.trim() !== "" && exists(candidate)) return candidate;
  }
  return null;
}

export function probeAndroidToolchain(
  options: AndroidToolchainProbeOptions = {},
): AndroidToolchain {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();
  const exists = options.exists ?? existsSync;

  const sdkRoot = firstExisting(
    [
      env.ANDROID_HOME,
      env.ANDROID_SDK_ROOT,
      platform === "darwin"
        ? path.join(home, "Library", "Android", "sdk")
        : path.join(home, "Android", "Sdk"),
    ],
    exists,
  );

  const adbPath = sdkRoot
    ? firstExisting([path.join(sdkRoot, "platform-tools", executableName(platform, "adb"))], exists)
    : null;
  const emulatorPath = sdkRoot
    ? firstExisting([path.join(sdkRoot, "emulator", executableName(platform, "emulator"))], exists)
    : null;

  const androidUserHome = env.ANDROID_USER_HOME?.trim() || path.join(home, ".android");
  const avdHome = env.ANDROID_AVD_HOME?.trim() || path.join(androidUserHome, "avd");

  const scrcpyServerPath = firstExisting(
    [
      env.SCRCPY_SERVER_PATH,
      ...SCRCPY_SERVER_CANDIDATES,
      path.join(home, ".local", "share", "luminor", "scrcpy-server"),
    ],
    exists,
  );

  return { sdkRoot, adbPath, emulatorPath, avdHome, scrcpyServerPath };
}
