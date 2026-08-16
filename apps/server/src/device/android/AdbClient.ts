import { runProcess } from "../../processRunner.ts";
import { DeviceBackendError } from "../DeviceBackend.ts";

export interface AdbDeviceRow {
  readonly serial: string;
  readonly state: "device" | "offline" | "unauthorized";
}

export function parseAdbDevices(stdout: string): readonly AdbDeviceRow[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("List of devices") && !line.startsWith("*"))
    .flatMap((line) => {
      const [serial, state] = line.split(/\s+/u);
      if (!serial || !state) return [];
      if (state !== "device" && state !== "offline" && state !== "unauthorized") return [];
      return [{ serial, state }];
    });
}

export function parseWmSize(stdout: string): { widthPx: number; heightPx: number } {
  const override = /Override size:\s*(\d+)x(\d+)/u.exec(stdout);
  const physical = /Physical size:\s*(\d+)x(\d+)/u.exec(stdout);
  const match = override ?? physical;
  if (!match) throw new DeviceBackendError(`Could not parse display size from: ${stdout.trim()}`);
  return { widthPx: Number(match[1]), heightPx: Number(match[2]) };
}

export function parseWmDensity(stdout: string): number {
  const override = /Override density:\s*(\d+)/u.exec(stdout);
  const physical = /Physical density:\s*(\d+)/u.exec(stdout);
  const match = override ?? physical;
  if (!match)
    throw new DeviceBackendError(`Could not parse display density from: ${stdout.trim()}`);
  return Number(match[1]);
}

export interface AdbClientOptions {
  readonly adbPath: string;
  readonly emulatorPath: string | null;
  readonly run?: typeof runProcess;
}

const ADB_DEFAULT_TIMEOUT_MS = 20_000;

export class AdbClient {
  private readonly adbPath: string;
  private readonly emulatorPath: string | null;
  private readonly run: typeof runProcess;

  constructor(options: AdbClientOptions) {
    this.adbPath = options.adbPath;
    this.emulatorPath = options.emulatorPath;
    this.run = options.run ?? runProcess;
  }

  async adb(args: readonly string[], options?: { timeoutMs?: number }): Promise<string> {
    const result = await this.run(this.adbPath, args, {
      timeoutMs: options?.timeoutMs ?? ADB_DEFAULT_TIMEOUT_MS,
      allowNonZeroExit: true,
    });
    if (result.code !== 0) {
      throw new DeviceBackendError(
        `adb ${args.join(" ")} failed (${result.code}): ${(result.stderr || result.stdout).trim()}`,
        { retryable: result.timedOut },
      );
    }
    return result.stdout;
  }

  shell(
    serial: string,
    args: readonly string[],
    options?: { timeoutMs?: number },
  ): Promise<string> {
    return this.adb(["-s", serial, "shell", ...args], options);
  }

  async listSerials(): Promise<readonly AdbDeviceRow[]> {
    return parseAdbDevices(await this.adb(["devices"]));
  }

  async listAvdNames(): Promise<readonly string[]> {
    if (this.emulatorPath === null) return [];
    const result = await this.run(this.emulatorPath, ["-list-avds"], {
      timeoutMs: ADB_DEFAULT_TIMEOUT_MS,
      allowNonZeroExit: true,
    });
    if (result.code !== 0) return [];
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Za-z0-9._-]+$/u.test(line));
  }

  async avdNameForSerial(serial: string): Promise<string | null> {
    try {
      const stdout = await this.adb(["-s", serial, "emu", "avd", "name"]);
      const name = stdout.split("\n")[0]?.trim();
      return name && name !== "OK" ? name : null;
    } catch {
      return null;
    }
  }

  async bootCompleted(serial: string): Promise<boolean> {
    try {
      const stdout = await this.shell(serial, ["getprop", "sys.boot_completed"]);
      return stdout.trim() === "1";
    } catch {
      return false;
    }
  }

  displayGeometry(
    serial: string,
  ): Promise<{ widthPx: number; heightPx: number; densityDpi: number }> {
    return Promise.all([
      this.shell(serial, ["wm", "size"]),
      this.shell(serial, ["wm", "density"]),
    ]).then(([size, density]) => ({ ...parseWmSize(size), densityDpi: parseWmDensity(density) }));
  }
}
