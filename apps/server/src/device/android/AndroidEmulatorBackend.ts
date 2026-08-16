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
import { probeAndroidToolchain, type AndroidToolchain } from "./androidToolchain.ts";
import { androidFamily, androidGeometry, parseAvdConfigIni } from "./avdConfig.ts";

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
}

export class AndroidEmulatorBackend implements DeviceBackend {
  readonly platform = "android-emulator" as const;

  private readonly run: typeof runProcess;
  private readonly spawnProcess: NonNullable<AndroidEmulatorBackendOptions["spawnProcess"]>;
  private readonly readFile: (filePath: string) => Promise<string>;
  private readonly now: () => number;
  private readonly recordingDirectoryOverride: string | undefined;
  private readonly toolchainOverride: AndroidToolchain | undefined;
  private readonly deviceGeometry = new Map<string, DeviceGeometry>();
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

  boot(_udid: string): Promise<DeviceDescriptor> {
    return this.notImplemented();
  }

  shutdown(_udid: string): Promise<void> {
    return this.notImplemented();
  }

  install(_udid: string, _appPath: string): Promise<DeviceInstallAppResult> {
    return this.notImplemented();
  }

  launch(
    _udid: string,
    _bundleId: string,
    _launchArguments?: readonly string[],
  ): Promise<DeviceLaunchAppResult> {
    return this.notImplemented();
  }

  openUrl(_udid: string, _url: string): Promise<void> {
    return this.notImplemented();
  }

  tap(_udid: string, _x: number, _y: number): Promise<void> {
    return this.notImplemented();
  }

  swipe(_udid: string, _gesture: DeviceSwipeGesture): Promise<void> {
    return this.notImplemented();
  }

  typeText(_udid: string, _text: string): Promise<void> {
    return this.notImplemented();
  }

  keyEvent(_udid: string, _event: DeviceKeyEvent): Promise<void> {
    return this.notImplemented();
  }

  pressButton(_udid: string, _button: DeviceHardwareButton): Promise<void> {
    return this.notImplemented();
  }

  screenshot(
    _udid: string,
    _options?: { readonly save?: boolean },
  ): Promise<DeviceScreenshotResult> {
    return this.notImplemented();
  }

  startRecording(_udid: string): Promise<DeviceStartRecordingResult> {
    return this.notImplemented();
  }

  stopRecording(_udid: string): Promise<DeviceStopRecordingResult> {
    return this.notImplemented();
  }

  describeUi(_udid: string): Promise<DeviceDescribeUiResult> {
    return this.notImplemented();
  }

  attachStream(_udid: string, _onFrame: DeviceFrameListener): Promise<void> {
    return this.notImplemented();
  }

  detachStream(_udid: string): Promise<void> {
    return this.notImplemented();
  }
}
