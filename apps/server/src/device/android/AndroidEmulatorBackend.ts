import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { readFile as fsReadFile } from "node:fs/promises";
import * as path from "node:path";

import type {
  DeviceAvailability,
  DeviceDescribeUiResult,
  DeviceDescriptor,
  DeviceGeometry,
  DeviceHardwareButton,
  DeviceInstallAppResult,
  DeviceLaunchAppResult,
  DeviceScreenshotResult,
  DeviceSetupStep,
  DeviceStartRecordingResult,
  DeviceStopRecordingResult,
} from "@luminor/contracts";

import { runProcess } from "../../processRunner.ts";
import {
  DeviceBackendError,
  type DeviceBackend,
  type DeviceFrameListener,
  type DeviceKeyEvent,
  type DeviceListOptions,
  type DeviceSwipeGesture,
} from "../DeviceBackend.ts";
import { AdbClient } from "./AdbClient.ts";
import {
  ANDROID_HARDWARE_BUTTON_KEYCODES,
  escapeForAdbInputText,
  hidUsageToAndroidKeyCode,
} from "./androidKeys.ts";
import { probeAndroidToolchain, type AndroidToolchain } from "./androidToolchain.ts";
import { androidFamily, androidGeometry, parseAvdConfigIni } from "./avdConfig.ts";
import { resolveApkPackageName } from "./apkPackageName.ts";
import { pngDimensions } from "./pngDimensions.ts";
import { parseUiautomatorXml } from "./uiautomatorTree.ts";
import { resolveDeviceRecordingDirectory } from "../recordingPaths.ts";

export interface AndroidEmulatorBackendOptions {
  readonly toolchain?: AndroidToolchain;
  readonly run?: typeof runProcess;
  readonly spawnProcess?: (
    command: string,
    args: readonly string[],
    options: { readonly detached: boolean },
  ) => ChildProcess;
  readonly readFile?: (filePath: string) => Promise<string>;
  readonly now?: () => number;
  readonly recordingDirectory?: string;
  readonly bootDeadlineMs?: number;
  readonly bootPollIntervalMs?: number;
  readonly listBuildToolsDirs?: (sdkRoot: string) => Promise<readonly string[]>;
}

export class AndroidEmulatorBackend implements DeviceBackend {
  private static readonly BOOT_DEADLINE_MS = 180_000;
  private static readonly BOOT_POLL_INTERVAL_MS = 2_000;

  readonly platform = "android-emulator" as const;

  private readonly run: typeof runProcess;
  private readonly spawnProcess: NonNullable<AndroidEmulatorBackendOptions["spawnProcess"]>;
  private readonly readFile: (filePath: string) => Promise<string>;
  private readonly now: () => number;
  private readonly recordingDirectoryOverride: string | undefined;
  private readonly toolchainOverride: AndroidToolchain | undefined;
  private readonly bootDeadlineMs: number;
  private readonly bootPollIntervalMs: number;
  private readonly listBuildToolsDirsOverride:
    | ((sdkRoot: string) => Promise<readonly string[]>)
    | undefined;
  private readonly deviceGeometry = new Map<string, DeviceGeometry>();
  private readonly activeRecordings = new Map<
    string,
    { child: ChildProcess; devicePath: string; localPath: string; startedAtMs: number }
  >();
  private disposed = false;

  constructor(options: AndroidEmulatorBackendOptions = {}) {
    this.toolchainOverride = options.toolchain;
    this.run = options.run ?? runProcess;
    this.spawnProcess =
      options.spawnProcess ??
      ((command, args, spawnOptions) =>
        spawn(command, [...args], {
          detached: spawnOptions.detached,
          stdio: "ignore",
          windowsHide: true,
        }));
    this.readFile = options.readFile ?? ((filePath) => fsReadFile(filePath, "utf-8"));
    this.now = options.now ?? Date.now;
    this.recordingDirectoryOverride = options.recordingDirectory;
    this.bootDeadlineMs = options.bootDeadlineMs ?? AndroidEmulatorBackend.BOOT_DEADLINE_MS;
    this.bootPollIntervalMs =
      options.bootPollIntervalMs ?? AndroidEmulatorBackend.BOOT_POLL_INTERVAL_MS;
    this.listBuildToolsDirsOverride = options.listBuildToolsDirs;
  }

  private toolchain(): AndroidToolchain {
    return this.toolchainOverride ?? probeAndroidToolchain();
  }

  private adbClient(): AdbClient {
    const toolchain = this.toolchain();
    if (toolchain.adbPath === null) {
      throw new DeviceBackendError("adb is not installed; complete the Android setup steps first.");
    }
    return new AdbClient({
      adbPath: toolchain.adbPath,
      emulatorPath: toolchain.emulatorPath,
      run: this.run,
    });
  }

  async availability(): Promise<DeviceAvailability> {
    const toolchain = this.toolchain();
    const steps: DeviceSetupStep[] = [];

    const sdkInstalled = toolchain.sdkRoot !== null;
    steps.push({
      id: "install-android-sdk",
      label: "Install the Android SDK",
      done: sdkInstalled,
      detail: sdkInstalled
        ? undefined
        : "Install the command line tools and set ANDROID_HOME (Android Studio is not required).",
    });

    const adbInstalled = toolchain.adbPath !== null;
    steps.push({
      id: "install-android-platform-tools",
      label: "Install platform-tools (adb)",
      done: adbInstalled,
      detail: adbInstalled ? undefined : 'sdkmanager "platform-tools"',
    });

    const emulatorInstalled = toolchain.emulatorPath !== null;
    steps.push({
      id: "install-android-emulator",
      label: "Install the Android emulator",
      done: emulatorInstalled,
      detail: emulatorInstalled ? undefined : 'sdkmanager "emulator"',
    });

    const avds = emulatorInstalled ? await this.adbClient().listAvdNames() : [];
    const hasAvd = avds.length > 0;
    steps.push({
      id: "create-android-avd",
      label: "Create a virtual device",
      done: hasAvd,
      detail: hasAvd
        ? undefined
        : 'sdkmanager "system-images;android-35;google_apis;x86_64" && avdmanager create avd -n Luminor -k "system-images;android-35;google_apis;x86_64"',
    });

    const scrcpyInstalled = toolchain.scrcpyServerPath !== null;
    steps.push({
      id: "install-scrcpy",
      label: "Install scrcpy (screen streaming)",
      done: scrcpyInstalled,
      detail: scrcpyInstalled
        ? undefined
        : "pacman -S scrcpy · apt install scrcpy · brew install scrcpy",
    });

    return steps.every((step) => step.done)
      ? { kind: "available" }
      : { kind: "setup-required", steps };
  }

  async listDevices(options: DeviceListOptions = {}): Promise<readonly DeviceDescriptor[]> {
    const adb = this.adbClient();
    const [avdNames, serialRows] = await Promise.all([adb.listAvdNames(), adb.listSerials()]);

    const serialByAvd = new Map<string, string>();
    for (const row of serialRows) {
      if (row.state !== "device" || !row.serial.startsWith("emulator-")) continue;
      const name = await adb.avdNameForSerial(row.serial);
      if (name !== null) serialByAvd.set(name, row.serial);
    }

    const descriptors: DeviceDescriptor[] = [];
    for (const avdName of avdNames) {
      const serial = serialByAvd.get(avdName);
      const state =
        serial === undefined
          ? "shutdown"
          : (await adb.bootCompleted(serial))
            ? "booted"
            : "booting";
      if (state === "shutdown" && options.includeShutdown !== true) continue;

      const profile = parseAvdConfigIni(
        await this.readFile(
          path.join(this.toolchain().avdHome, `${avdName}.avd`, "config.ini"),
        ).catch(() => ""),
      );
      const geometry =
        profile.widthPx !== null && profile.heightPx !== null && profile.densityDpi !== null
          ? androidGeometry(profile.widthPx, profile.heightPx, profile.densityDpi)
          : undefined;
      if (geometry) this.deviceGeometry.set(avdName, geometry);

      descriptors.push({
        platform: "android-emulator",
        udid: avdName,
        name: avdName.replaceAll("_", " "),
        runtime: profile.apiLevel === null ? "Android" : `Android API ${profile.apiLevel}`,
        state,
        bootSource: "user",
        ...(geometry ? { family: androidFamily(geometry), geometry } : {}),
      });
    }
    return descriptors;
  }

  geometry(udid: string): DeviceGeometry | null {
    return this.deviceGeometry.get(udid) ?? null;
  }

  protected async serialFor(udid: string): Promise<string> {
    const adb = this.adbClient();
    for (const row of await adb.listSerials()) {
      if (row.state !== "device" || !row.serial.startsWith("emulator-")) continue;
      if ((await adb.avdNameForSerial(row.serial)) === udid) return row.serial;
    }
    throw new DeviceBackendError(`Emulator "${udid}" is not running.`, { retryable: true });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  private notImplemented(): never {
    throw new DeviceBackendError("Not implemented for android-emulator yet");
  }

  async boot(udid: string): Promise<DeviceDescriptor> {
    const toolchain = this.toolchain();
    if (toolchain.emulatorPath === null) {
      throw new DeviceBackendError("The Android emulator is not installed.");
    }
    const known = await this.adbClient().listAvdNames();
    if (!known.includes(udid)) {
      throw new DeviceBackendError(`No AVD named "${udid}".`);
    }

    const alreadyRunning = await this.serialFor(udid).catch(() => null);
    if (alreadyRunning === null) {
      const child = this.spawnProcess(
        toolchain.emulatorPath,
        ["-avd", udid, "-no-window", "-no-boot-anim", "-no-audio", "-gpu", "auto"],
        { detached: true },
      );
      child.unref();
    }

    const deadline = this.now() + this.bootDeadlineMs;
    while (this.now() < deadline) {
      if (this.disposed) throw new DeviceBackendError("Backend disposed during boot.");
      const serial = await this.serialFor(udid).catch(() => null);
      if (serial !== null && (await this.adbClient().bootCompleted(serial))) {
        const devices = await this.listDevices({ includeShutdown: true });
        const descriptor = devices.find((device) => device.udid === udid);
        if (descriptor) return { ...descriptor, state: "booted" };
      }
      await this.sleep(this.bootPollIntervalMs);
    }
    throw new DeviceBackendError(`Emulator "${udid}" did not finish booting within 3 minutes.`, {
      retryable: true,
    });
  }

  async shutdown(udid: string): Promise<void> {
    const serial = await this.serialFor(udid).catch(() => null);
    if (serial === null) return;
    await this.adbClient().adb(["-s", serial, "emu", "kill"]);
    const deadline = this.now() + 15_000;
    while (this.now() < deadline) {
      const rows = await this.adbClient().listSerials();
      if (!rows.some((row) => row.serial === serial)) return;
      await this.sleep(500);
    }
  }

  async install(udid: string, appPath: string): Promise<DeviceInstallAppResult> {
    if (!appPath.endsWith(".apk")) {
      throw new DeviceBackendError(`Android installs need an .apk file, got: ${appPath}`);
    }
    const toolchain = this.toolchain();
    if (toolchain.sdkRoot === null) throw new DeviceBackendError("Android SDK not installed.");
    const serial = await this.serialFor(udid);
    const bundleId = await resolveApkPackageName({
      apkPath: appPath,
      sdkRoot: toolchain.sdkRoot,
      run: this.run,
      listBuildToolsDirs: () => this.listBuildToolsDirs(toolchain.sdkRoot ?? ""),
    });
    await this.adbClient().adb(["-s", serial, "install", "-r", "-t", appPath], {
      timeoutMs: 120_000,
    });
    return { udid, bundleId };
  }

  async launch(
    udid: string,
    bundleId: string,
    launchArguments: readonly string[] = [],
  ): Promise<DeviceLaunchAppResult> {
    const serial = await this.serialFor(udid);
    const adb = this.adbClient();
    const resolved = await adb.shell(serial, [
      "cmd",
      "package",
      "resolve-activity",
      "--brief",
      bundleId,
    ]);
    const component = resolved.trim().split("\n").at(-1)?.trim();
    if (!component || !component.includes("/")) {
      throw new DeviceBackendError(`No launchable activity found for ${bundleId}.`);
    }
    await adb.shell(serial, ["am", "start", "-W", "-n", component, ...launchArguments], {
      timeoutMs: 30_000,
    });
    const pidOut = await adb.shell(serial, ["pidof", bundleId]).catch(() => "");
    const pid = Number.parseInt(pidOut.trim().split(/\s+/u)[0] ?? "", 10);
    return { udid, bundleId, pid: Number.isFinite(pid) && pid > 0 ? pid : null };
  }

  async openUrl(udid: string, url: string): Promise<void> {
    const serial = await this.serialFor(udid);
    await this.adbClient().shell(serial, [
      "am",
      "start",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      url,
    ]);
  }

  async tap(udid: string, x: number, y: number): Promise<void> {
    const serial = await this.serialFor(udid);
    const { scale } = await this.geometryFor(udid, serial);
    await this.adbClient().shell(serial, [
      "input",
      "tap",
      String(Math.round(x * scale)),
      String(Math.round(y * scale)),
    ]);
  }

  async swipe(udid: string, gesture: DeviceSwipeGesture): Promise<void> {
    const serial = await this.serialFor(udid);
    const { scale } = await this.geometryFor(udid, serial);
    await this.adbClient().shell(serial, [
      "input",
      "swipe",
      String(Math.round(gesture.fromX * scale)),
      String(Math.round(gesture.fromY * scale)),
      String(Math.round(gesture.toX * scale)),
      String(Math.round(gesture.toY * scale)),
      String(Math.max(1, Math.round(gesture.durationMs))),
    ]);
  }

  async typeText(udid: string, text: string): Promise<void> {
    if (text === "") return;
    const serial = await this.serialFor(udid);
    await this.adbClient().shell(serial, ["input", "text", escapeForAdbInputText(text)]);
  }

  async keyEvent(udid: string, event: DeviceKeyEvent): Promise<void> {
    if (event.direction === "up") return;
    const keyCode = hidUsageToAndroidKeyCode(event.keyCode);
    if (keyCode === null) return;
    const serial = await this.serialFor(udid);
    await this.adbClient().shell(serial, ["input", "keyevent", String(keyCode)]);
  }

  async pressButton(udid: string, button: DeviceHardwareButton): Promise<void> {
    const serial = await this.serialFor(udid);
    if (button === "rotate") {
      await this.adbClient().adb(["-s", serial, "emu", "rotate"]);
      return;
    }
    const keyCode = ANDROID_HARDWARE_BUTTON_KEYCODES[button];
    if (keyCode === undefined) {
      throw new DeviceBackendError(`Button "${button}" is not supported on Android emulators.`);
    }
    await this.adbClient().shell(serial, ["input", "keyevent", String(keyCode)]);
  }

  async screenshot(
    udid: string,
    options?: { readonly save?: boolean },
  ): Promise<DeviceScreenshotResult> {
    const serial = await this.serialFor(udid);
    const devicePath = "/data/local/tmp/luminor-screenshot.png";
    await this.adbClient().shell(serial, ["screencap", "-p", devicePath]);

    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const tempDir = await mkdtemp(path.join(tmpdir(), "luminor-android-"));
    const localPath = path.join(tempDir, "screenshot.png");
    try {
      await this.adbClient().adb(["-s", serial, "pull", devicePath, localPath], {
        timeoutMs: 30_000,
      });
      const bytes = await readFile(localPath);
      const { width, height } = pngDimensions(bytes);
      const capturedAt = new Date(this.now()).toISOString();
      const name = `${udid}-${capturedAt.replaceAll(/[:.]/gu, "-")}.png`;
      let savedPath: string | undefined;
      if (options?.save === true) {
        const { copyFile, mkdir } = await import("node:fs/promises");
        const directory = await resolveDeviceRecordingDirectory(this.recordingDirectoryOverride);
        await mkdir(directory, { recursive: true });
        savedPath = path.join(directory, name);
        await copyFile(localPath, savedPath);
      }
      return {
        udid,
        name,
        mimeType: "image/png",
        width,
        height,
        sizeBytes: bytes.byteLength,
        bytesBase64: Buffer.from(bytes).toString("base64"),
        capturedAt,
        ...(savedPath ? { path: savedPath } : {}),
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      await this.adbClient()
        .shell(serial, ["rm", "-f", devicePath])
        .catch(() => {});
    }
  }

  async startRecording(udid: string): Promise<DeviceStartRecordingResult> {
    const serial = await this.serialFor(udid);
    if (this.activeRecordings.has(udid)) {
      throw new DeviceBackendError(`A recording is already running for ${udid}.`);
    }
    const startedAtMs = this.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const stamp = startedAt.replaceAll(/[:.]/gu, "-");
    const devicePath = `/data/local/tmp/luminor-rec-${stamp}.mp4`;
    const directory = await resolveDeviceRecordingDirectory(this.recordingDirectoryOverride);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(directory, { recursive: true });
    const localPath = path.join(directory, `${udid}-${stamp}.mp4`);
    const toolchain = this.toolchain();
    if (toolchain.adbPath === null) throw new DeviceBackendError("adb is not installed.");
    const child = this.spawnProcess(
      toolchain.adbPath,
      ["-s", serial, "shell", "screenrecord", "--bugreport", devicePath],
      { detached: false },
    );
    this.activeRecordings.set(udid, { child, devicePath, localPath, startedAtMs });
    return { udid, path: localPath, startedAt };
  }

  async stopRecording(udid: string): Promise<DeviceStopRecordingResult> {
    const active = this.activeRecordings.get(udid);
    if (!active) throw new DeviceBackendError(`No recording is running for ${udid}.`);
    this.activeRecordings.delete(udid);
    const serial = await this.serialFor(udid);

    active.child.kill("SIGINT");
    await new Promise<void>((resolve) => {
      active.child.once("exit", () => resolve());
      setTimeout(resolve, 5_000);
    });
    await this.sleep(500);

    const { stat } = await import("node:fs/promises");
    await this.adbClient().adb(["-s", serial, "pull", active.devicePath, active.localPath], {
      timeoutMs: 60_000,
    });
    await this.adbClient()
      .shell(serial, ["rm", "-f", active.devicePath])
      .catch(() => {});
    const sizeBytes = await stat(active.localPath)
      .then((value) => value.size)
      .catch(() => 0);
    const stoppedAtMs = this.now();
    return {
      udid,
      path: active.localPath,
      sizeBytes,
      durationMs: Math.max(0, stoppedAtMs - active.startedAtMs),
      stoppedAt: new Date(stoppedAtMs).toISOString(),
    };
  }

  async describeUi(udid: string): Promise<DeviceDescribeUiResult> {
    const serial = await this.serialFor(udid);
    const { scale } = await this.geometryFor(udid, serial);
    const devicePath = "/data/local/tmp/luminor-uidump.xml";
    await this.adbClient().shell(serial, ["uiautomator", "dump", devicePath], {
      timeoutMs: 30_000,
    });
    const xml = await this.adbClient().shell(serial, ["cat", devicePath]);
    await this.adbClient()
      .shell(serial, ["rm", "-f", devicePath])
      .catch(() => {});
    return {
      udid,
      capturedAt: new Date(this.now()).toISOString(),
      root: parseUiautomatorXml(xml, scale),
    };
  }

  attachStream(_udid: string, _onFrame: DeviceFrameListener): Promise<void> {
    return this.notImplemented();
  }

  detachStream(_udid: string): Promise<void> {
    return this.notImplemented();
  }

  private sleep(ms: number): Promise<void> {
    return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async geometryFor(udid: string, serial: string): Promise<DeviceGeometry> {
    const cached = this.deviceGeometry.get(udid);
    if (cached) return cached;
    const display = await this.adbClient().displayGeometry(serial);
    const geometry = androidGeometry(display.widthPx, display.heightPx, display.densityDpi);
    this.deviceGeometry.set(udid, geometry);
    return geometry;
  }

  private async listBuildToolsDirs(sdkRoot: string): Promise<readonly string[]> {
    if (this.listBuildToolsDirsOverride) return this.listBuildToolsDirsOverride(sdkRoot);
    const { readdir } = await import("node:fs/promises");
    return readdir(path.join(sdkRoot, "build-tools")).catch(() => []);
  }
}
