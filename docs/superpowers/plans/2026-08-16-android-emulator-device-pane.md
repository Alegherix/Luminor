# Android Emulator Device Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The right-dock device pane can spin up an Android emulator on Linux (and any non-macOS server) with live video, taps, and the full `device_*` tool surface — no Android Studio needed.

**Architecture:** Add an `AndroidEmulatorBackend` implementing the existing `DeviceBackend` interface (`apps/server/src/device/DeviceBackend.ts:82`). Everything above the backend — `DeviceManager`, WebSocket handlers, frame transport, MCP tools, the pane UI — already exists and is platform-neutral by design. The backend shells out to `adb`/`emulator` via the existing `runProcess`, and streams H.264 from the device using the scrcpy server (`raw_stream` mode) into the existing binary frame pipeline (`DeviceStreamFrame` → `DeviceFrameTransport` → `/ws/device-frames` → WebCodecs).

**Tech Stack:** TypeScript (Node), Effect layers (wiring only — backends are promise-shaped), Vitest, adb / Android SDK emulator, scrcpy-server, React (pane tweaks).

## Global Constraints

- `bun fmt`, `bun lint`, `bun typecheck` must pass — run them as ONE bundled pass at the end of each task, before that task's commit.
- NEVER run `bun test`. Tests run via `bun run test <path>` (Vitest).
- Do not add explanatory source-code comments (repo policy). Exception: protocol/concurrency invariants that cannot be expressed via naming/types (the NAL parser and scrcpy handshake qualify).
- Backends speak plain promises, not Effect (stated in `DeviceBackend.ts` module docs). Keep every new module injectable (pass `run`, `exists`, `env`, `now`, `spawn` via options) so tests never touch a real SDK.
- Do NOT modify `DeviceManager`, `wsDeviceHandlers`, `DeviceFrameTransport`, or `agentGateway/deviceTools.ts` — the whole point of the architecture is that a new backend plugs in beneath them. Task 11 only changes which backend the layer constructs.
- `DevicePlatform` udid for Android emulators is the **AVD name** (stable across boots, matches `DeviceUdid` pattern `^[A-Za-z0-9._:-]+$`). The adb serial (`emulator-5554`) is a backend-internal detail resolved per call.
- Physical Android devices (`android-device`, e.g. the Galaxy S24 over USB) are OUT OF SCOPE for this plan — follow-up plan.
- Windows paths are handled by the toolchain locator (`.exe` suffixes) but Windows is not a verification target here; Linux is.

## Pre-existing architecture (read once, don't rediscover)

| Piece | Where | Status |
|---|---|---|
| `DeviceBackend` interface (20 methods) | `apps/server/src/device/DeviceBackend.ts:82` | reuse as-is |
| `DeviceManager` (boot cap, idle shutdown, stream serialization) | `apps/server/src/device/DeviceManager.ts:150` | untouched |
| Backend construction + `supported` gate | `apps/server/src/device/Layers/DeviceService.ts:40` (`supported: platform === "darwin"`, always `new IosSimulatorBackend`) | Task 11 |
| WS RPC gate | `apps/server/src/device/wsDeviceHandlers.ts:147` (`if (!deviceService?.supported)`) | untouched — gate passes once supported=true |
| Binary frame envelope + `/ws/device-frames` | `packages/shared/src/deviceFrame.ts`, `packages/contracts/src/device.ts:662` | reuse as-is |
| Web support gate | `apps/web/src/hooks/useDeviceSupport.ts:20` (`os === "darwin"`) | Task 12 |
| Pane label | `apps/web/src/components/chat/rightDockPaneMeta.tsx:49` (`device: { label: "iOS Simulator", ... }`) | Task 12 |
| Android chassis | `apps/web/src/components/device/DeviceFrame.tsx:25` (`DeviceKind = "iPhone" | "androidPhone" | "iPad"`, `deviceKindFor` matches `platform.startsWith("android")`) | already done |
| Setup checklist rendering | `apps/web/src/components/DevicePanel.logic.ts:749` (`DEVICE_SETUP_ACTIONS`), `:770` (`deviceSetupCheckingLabel`) | Task 12 |
| Env descriptor (`platform.os`, `capabilities`) | `apps/server/src/environment/Layers/ServerEnvironment.ts:69-80`, `packages/contracts/src/environment.ts:30` | Tasks 1, 11 |
| Process runner | `apps/server/src/processRunner.ts:135` — `runProcess(command, args, options): Promise<ProcessRunResult>` with `{ stdout, stderr, code, signal, timedOut }`; text-only stdout (binary output must go via device file + `adb pull`) | reuse |
| Reference backend + fake | `apps/server/src/device/IosSimulatorBackend.ts:245`, `apps/server/src/device/FakeDeviceBackend.ts:95` | reference |

New Android code lives in `apps/server/src/device/android/`.

---

### Task 1: Contracts — Android platform, setup step ids, env capability

**Files:**
- Modify: `packages/contracts/src/device.ts:53` (DevicePlatform), `:126` (DeviceSetupStepId)
- Modify: `packages/contracts/src/environment.ts` (capabilities struct referenced from `ExecutionEnvironmentDescriptor`, line ~30)
- Test: `packages/contracts/src/device.test.ts`

**Interfaces:**
- Produces: `DevicePlatform` now includes `"android-emulator"`; `DeviceSetupStepId` includes `"install-android-sdk" | "install-android-platform-tools" | "install-android-emulator" | "create-android-avd" | "install-scrcpy"`; `ExecutionEnvironmentDescriptor["capabilities"]` gains optional `devicePane?: boolean`.

- [ ] **Step 1: Write the failing test**

Add to `packages/contracts/src/device.test.ts` (follow the file's existing decode-assertion style):

```typescript
it("accepts android-emulator descriptors and android setup steps", () => {
  const descriptor = Schema.decodeUnknownSync(DeviceDescriptor)({
    platform: "android-emulator",
    udid: "Pixel_8_API_35",
    name: "Pixel 8 API 35",
    runtime: "Android API 35",
    state: "shutdown",
    bootSource: "user",
  });
  expect(descriptor.platform).toBe("android-emulator");

  const step = Schema.decodeUnknownSync(DeviceSetupStep)({
    id: "install-android-sdk",
    label: "Install the Android SDK",
    done: false,
  });
  expect(step.id).toBe("install-android-sdk");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test packages/contracts/src/device.test.ts`
Expected: FAIL — `"android-emulator"` / `"install-android-sdk"` rejected by the literal schemas.

- [ ] **Step 3: Widen the literals**

```typescript
export const DevicePlatform = Schema.Literals(["ios-simulator", "android-emulator"]);
```

```typescript
export const DeviceSetupStepId = Schema.Literals([
  "install-xcode",
  "accept-xcode-license",
  "select-xcode-command-line-tools",
  "install-ios-runtime",
  "build-device-helper",
  "install-android-sdk",
  "install-android-platform-tools",
  "install-android-emulator",
  "create-android-avd",
  "install-scrcpy",
]);
```

In `packages/contracts/src/environment.ts`, find the struct assigned to the `capabilities` field of `ExecutionEnvironmentDescriptor` (it currently has `repositoryIdentity`) and add:

```typescript
devicePane: Schema.optional(Schema.Boolean),
```

- [ ] **Step 4: Run tests + verify typecheck fallout**

Run: `bun run test packages/contracts/src/device.test.ts` — expected PASS.
Then `bun typecheck` from repo root. Expected fallout to fix in this task: exhaustive `switch`/`Record` over `DevicePlatform` or `DeviceSetupStepId` anywhere in `apps/` — the known one is `DEVICE_SETUP_ACTIONS: Partial<Record<DeviceSetupStepId, ...>>` in `apps/web/src/components/DevicePanel.logic.ts:749`, which is `Partial` and needs no change. Fix any others by handling the new literals explicitly (UI copy comes in Task 12; a plain fallthrough is fine here).

- [ ] **Step 5: Bundled verification + commit**

```bash
bun fmt && bun lint && bun typecheck
git add packages/contracts apps/web
git commit -m "feat(contracts): add android-emulator device platform and setup steps"
```

---

### Task 2: Android toolchain locator

**Files:**
- Create: `apps/server/src/device/android/androidToolchain.ts`
- Test: `apps/server/src/device/android/androidToolchain.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface AndroidToolchain {
    readonly sdkRoot: string | null;
    readonly adbPath: string | null;
    readonly emulatorPath: string | null;
    readonly avdHome: string;
    readonly scrcpyServerPath: string | null;
  }
  function probeAndroidToolchain(options?: AndroidToolchainProbeOptions): AndroidToolchain
  ```
  `AndroidToolchainProbeOptions = { env?, platform?, homeDir?, exists? }` — all injectable.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { probeAndroidToolchain } from "./androidToolchain";

const fakeFs = (present: readonly string[]) => (p: string) => present.includes(p);

describe("probeAndroidToolchain", () => {
  it("resolves the SDK from ANDROID_HOME and finds adb, emulator, scrcpy", () => {
    const toolchain = probeAndroidToolchain({
      env: { ANDROID_HOME: "/sdk" },
      platform: "linux",
      homeDir: "/home/u",
      exists: fakeFs([
        "/sdk",
        "/sdk/platform-tools/adb",
        "/sdk/emulator/emulator",
        "/usr/share/scrcpy/scrcpy-server",
      ]),
    });
    expect(toolchain).toEqual({
      sdkRoot: "/sdk",
      adbPath: "/sdk/platform-tools/adb",
      emulatorPath: "/sdk/emulator/emulator",
      avdHome: "/home/u/.android/avd",
      scrcpyServerPath: "/usr/share/scrcpy/scrcpy-server",
    });
  });

  it("falls back to ~/Android/Sdk on linux and reports missing pieces as null", () => {
    const toolchain = probeAndroidToolchain({
      env: {},
      platform: "linux",
      homeDir: "/home/u",
      exists: fakeFs(["/home/u/Android/Sdk"]),
    });
    expect(toolchain.sdkRoot).toBe("/home/u/Android/Sdk");
    expect(toolchain.adbPath).toBeNull();
    expect(toolchain.scrcpyServerPath).toBeNull();
  });

  it("prefers SCRCPY_SERVER_PATH and ANDROID_AVD_HOME overrides", () => {
    const toolchain = probeAndroidToolchain({
      env: { SCRCPY_SERVER_PATH: "/opt/jar", ANDROID_AVD_HOME: "/data/avd" },
      platform: "linux",
      homeDir: "/home/u",
      exists: fakeFs(["/opt/jar"]),
    });
    expect(toolchain.scrcpyServerPath).toBe("/opt/jar");
    expect(toolchain.avdHome).toBe("/data/avd");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/server/src/device/android/androidToolchain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
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
    [env.SCRCPY_SERVER_PATH, ...SCRCPY_SERVER_CANDIDATES],
    exists,
  );

  return { sdkRoot, adbPath, emulatorPath, avdHome, scrcpyServerPath };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test apps/server/src/device/android/androidToolchain.test.ts` — expected PASS.

- [ ] **Step 5: Bundled verification + commit**

```bash
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): android toolchain locator for the device pane"
```

---

### Task 3: AdbClient — command wrapper and output parsers

**Files:**
- Create: `apps/server/src/device/android/AdbClient.ts`
- Test: `apps/server/src/device/android/AdbClient.test.ts`

**Interfaces:**
- Consumes: `runProcess` from `apps/server/src/processRunner.ts` (injected as `run`).
- Produces:
  ```typescript
  class AdbClient {
    constructor(options: { adbPath: string; emulatorPath: string | null; run?: typeof runProcess });
    listSerials(): Promise<readonly { serial: string; state: "device" | "offline" | "unauthorized" }[]>;
    listAvdNames(): Promise<readonly string[]>;
    avdNameForSerial(serial: string): Promise<string | null>;
    bootCompleted(serial: string): Promise<boolean>;
    shell(serial: string, args: readonly string[], options?: { timeoutMs?: number }): Promise<string>;
    adb(args: readonly string[], options?: { timeoutMs?: number }): Promise<string>;
    displayGeometry(serial: string): Promise<{ widthPx: number; heightPx: number; densityDpi: number }>;
  }
  ```
  Plus exported pure parsers: `parseAdbDevices(stdout)`, `parseWmSize(stdout)`, `parseWmDensity(stdout)`.

- [ ] **Step 1: Write the failing test** (pure parsers + one wiring case with a fake `run`)

```typescript
import { describe, expect, it } from "vitest";
import { AdbClient, parseAdbDevices, parseWmDensity, parseWmSize } from "./AdbClient";

describe("adb output parsers", () => {
  it("parses adb devices -l output", () => {
    const stdout = [
      "List of devices attached",
      "emulator-5554\tdevice product:sdk_gphone64_x86_64",
      "emulator-5556\toffline",
      "",
    ].join("\n");
    expect(parseAdbDevices(stdout)).toEqual([
      { serial: "emulator-5554", state: "device" },
      { serial: "emulator-5556", state: "offline" },
    ]);
  });

  it("prefers Override size over Physical size", () => {
    expect(parseWmSize("Physical size: 1080x2340\nOverride size: 720x1560\n")).toEqual({
      widthPx: 720,
      heightPx: 1560,
    });
    expect(parseWmDensity("Physical density: 440\n")).toBe(440);
  });
});

describe("AdbClient", () => {
  it("resolves avd name via the emulator console", async () => {
    const client = new AdbClient({
      adbPath: "/sdk/platform-tools/adb",
      emulatorPath: "/sdk/emulator/emulator",
      run: async (command, args) => {
        expect(command).toBe("/sdk/platform-tools/adb");
        expect(args).toEqual(["-s", "emulator-5554", "emu", "avd", "name"]);
        return {
          stdout: "Pixel_8_API_35\r\nOK\r\n",
          stderr: "",
          code: 0,
          signal: null,
          timedOut: false,
        };
      },
    });
    expect(await client.avdNameForSerial("emulator-5554")).toBe("Pixel_8_API_35");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/server/src/device/android/AdbClient.test.ts` — FAIL, module not found.

- [ ] **Step 3: Implement**

```typescript
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
  if (!match) throw new DeviceBackendError(`Could not parse display density from: ${stdout.trim()}`);
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

  shell(serial: string, args: readonly string[], options?: { timeoutMs?: number }): Promise<string> {
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

  async displayGeometry(
    serial: string,
  ): Promise<{ widthPx: number; heightPx: number; densityDpi: number }> {
    const [size, density] = await Promise.all([
      this.shell(serial, ["wm", "size"]),
      this.shell(serial, ["wm", "density"]),
    ]);
    return { ...parseWmSize(size), densityDpi: parseWmDensity(density) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test apps/server/src/device/android/AdbClient.test.ts` — expected PASS.

- [ ] **Step 5: Bundled verification + commit**

```bash
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): adb client with parsed device, avd and geometry reads"
```

---

### Task 4: AndroidEmulatorBackend skeleton — availability, listDevices, geometry

**Files:**
- Create: `apps/server/src/device/android/AndroidEmulatorBackend.ts`
- Create: `apps/server/src/device/android/avdConfig.ts`
- Test: `apps/server/src/device/android/AndroidEmulatorBackend.test.ts`, `apps/server/src/device/android/avdConfig.test.ts`

**Interfaces:**
- Consumes: `probeAndroidToolchain` (Task 2), `AdbClient` (Task 3), `DeviceBackend`/`DeviceBackendError` from `../DeviceBackend.ts`, contract types from `@luminor/contracts`.
- Produces:
  ```typescript
  class AndroidEmulatorBackend implements DeviceBackend {
    readonly platform = "android-emulator";
    constructor(options?: AndroidEmulatorBackendOptions);
  }
  interface AndroidEmulatorBackendOptions {
    toolchain?: AndroidToolchain;        // omit to probe on demand
    run?: typeof runProcess;
    spawnProcess?: (command: string, args: readonly string[], opts: { detached: boolean }) => ChildProcess;
    readFile?: (path: string) => Promise<string>;
    now?: () => number;
    recordingDirectory?: string;
  }
  // avdConfig.ts
  interface AvdProfile { widthPx: number | null; heightPx: number | null; densityDpi: number | null; apiLevel: number | null; }
  function parseAvdConfigIni(text: string): AvdProfile
  function androidGeometry(widthPx: number, heightPx: number, densityDpi: number): DeviceGeometry
  ```
  All later tasks fill methods on this class; unimplemented methods throw `new DeviceBackendError("Not implemented for android-emulator yet")` until their task lands.

- [ ] **Step 1: Write the failing tests**

`avdConfig.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { androidGeometry, parseAvdConfigIni } from "./avdConfig";

describe("parseAvdConfigIni", () => {
  it("reads lcd geometry and api level", () => {
    const ini = [
      "avd.ini.encoding=UTF-8",
      "hw.lcd.density=440",
      "hw.lcd.height=2340",
      "hw.lcd.width=1080",
      "image.sysdir.1=system-images/android-35/google_apis/x86_64/",
    ].join("\n");
    expect(parseAvdConfigIni(ini)).toEqual({
      widthPx: 1080,
      heightPx: 2340,
      densityDpi: 440,
      apiLevel: 35,
    });
  });
});

describe("androidGeometry", () => {
  it("converts pixels to density-independent points", () => {
    expect(androidGeometry(1080, 2340, 440)).toEqual({
      pointWidth: 393,
      pointHeight: 851,
      scale: 2.75,
    });
  });
});
```

`AndroidEmulatorBackend.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ProcessRunResult } from "../../processRunner.ts";
import { AndroidEmulatorBackend } from "./AndroidEmulatorBackend";

const ok = (stdout: string): ProcessRunResult => ({
  stdout,
  stderr: "",
  code: 0,
  signal: null,
  timedOut: false,
});

const FULL_TOOLCHAIN = {
  sdkRoot: "/sdk",
  adbPath: "/sdk/platform-tools/adb",
  emulatorPath: "/sdk/emulator/emulator",
  avdHome: "/avd",
  scrcpyServerPath: "/usr/share/scrcpy/scrcpy-server",
};

function scriptedRun(script: Record<string, string>) {
  return async (command: string, args: readonly string[]): Promise<ProcessRunResult> => {
    const key = [command, ...args].join(" ");
    const stdout = script[key];
    if (stdout === undefined) throw new Error(`unexpected command: ${key}`);
    return ok(stdout);
  };
}

describe("AndroidEmulatorBackend.availability", () => {
  it("reports setup-required with every step undone when nothing is installed", async () => {
    const backend = new AndroidEmulatorBackend({
      toolchain: { sdkRoot: null, adbPath: null, emulatorPath: null, avdHome: "/avd", scrcpyServerPath: null },
    });
    const availability = await backend.availability();
    expect(availability.kind).toBe("setup-required");
    if (availability.kind === "setup-required") {
      expect(availability.steps.map((step) => step.id)).toEqual([
        "install-android-sdk",
        "install-android-platform-tools",
        "install-android-emulator",
        "create-android-avd",
        "install-scrcpy",
      ]);
      expect(availability.steps.every((step) => !step.done)).toBe(true);
    }
  });

  it("reports available when the toolchain, an avd, and scrcpy exist", async () => {
    const backend = new AndroidEmulatorBackend({
      toolchain: FULL_TOOLCHAIN,
      run: scriptedRun({ "/sdk/emulator/emulator -list-avds": "Pixel_8_API_35\n" }),
    });
    expect((await backend.availability()).kind).toBe("available");
  });
});

describe("AndroidEmulatorBackend.listDevices", () => {
  it("lists shutdown avds and marks running emulators booted", async () => {
    const backend = new AndroidEmulatorBackend({
      toolchain: FULL_TOOLCHAIN,
      run: scriptedRun({
        "/sdk/emulator/emulator -list-avds": "Pixel_8_API_35\nTablet_API_34\n",
        "/sdk/platform-tools/adb devices": "List of devices attached\nemulator-5554\tdevice\n",
        "/sdk/platform-tools/adb -s emulator-5554 emu avd name": "Pixel_8_API_35\nOK\n",
        "/sdk/platform-tools/adb -s emulator-5554 shell getprop sys.boot_completed": "1\n",
      }),
      readFile: async (filePath) =>
        filePath.includes("Tablet")
          ? "hw.lcd.width=1600\nhw.lcd.height=2560\nhw.lcd.density=320\nimage.sysdir.1=system-images/android-34/google_apis/x86_64/\n"
          : "hw.lcd.width=1080\nhw.lcd.height=2340\nhw.lcd.density=440\nimage.sysdir.1=system-images/android-35/google_apis/x86_64/\n",
    });

    const devices = await backend.listDevices({ includeShutdown: true });
    expect(devices).toHaveLength(2);

    const pixel = devices.find((device) => device.udid === "Pixel_8_API_35");
    expect(pixel?.state).toBe("booted");
    expect(pixel?.platform).toBe("android-emulator");
    expect(pixel?.runtime).toBe("Android API 35");
    expect(pixel?.family).toBe("phone");
    expect(pixel?.geometry).toEqual({ pointWidth: 393, pointHeight: 851, scale: 2.75 });

    const tablet = devices.find((device) => device.udid === "Tablet_API_34");
    expect(tablet?.state).toBe("shutdown");
    expect(tablet?.family).toBe("tablet");

    const bootedOnly = await backend.listDevices();
    expect(bootedOnly.map((device) => device.udid)).toEqual(["Pixel_8_API_35"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test apps/server/src/device/android/` — FAIL, modules not found.

- [ ] **Step 3: Implement `avdConfig.ts`**

```typescript
import type { DeviceGeometry } from "@luminor/contracts";

export interface AvdProfile {
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly densityDpi: number | null;
  readonly apiLevel: number | null;
}

const ANDROID_BASELINE_DPI = 160;

export function parseAvdConfigIni(text: string): AvdProfile {
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) entries.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const int = (key: string): number | null => {
    const raw = entries.get(key);
    const value = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const sysdir = entries.get("image.sysdir.1") ?? "";
  const api = /android-(\d+)/u.exec(sysdir);
  return {
    widthPx: int("hw.lcd.width"),
    heightPx: int("hw.lcd.height"),
    densityDpi: int("hw.lcd.density"),
    apiLevel: api ? Number.parseInt(api[1] ?? "", 10) : null,
  };
}

export function androidGeometry(
  widthPx: number,
  heightPx: number,
  densityDpi: number,
): DeviceGeometry {
  const scale = densityDpi / ANDROID_BASELINE_DPI;
  return {
    pointWidth: Math.round(widthPx / scale),
    pointHeight: Math.round(heightPx / scale),
    scale,
  };
}

const TABLET_SMALLEST_WIDTH_DP = 600;

export function androidFamily(geometry: DeviceGeometry): "phone" | "tablet" {
  return Math.min(geometry.pointWidth, geometry.pointHeight) >= TABLET_SMALLEST_WIDTH_DP
    ? "tablet"
    : "phone";
}
```

- [ ] **Step 4: Implement the backend skeleton**

```typescript
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { readFile as fsReadFile } from "node:fs/promises";
import * as path from "node:path";

import type {
  DeviceAvailability,
  DeviceDescriptor,
  DeviceGeometry,
  DeviceSetupStep,
} from "@luminor/contracts";

import { runProcess } from "../../processRunner.ts";
import {
  DeviceBackendError,
  type DeviceBackend,
  type DeviceFrameListener,
  type DeviceListOptions,
} from "../DeviceBackend.ts";
import { AdbClient } from "./AdbClient.ts";
import {
  probeAndroidToolchain,
  type AndroidToolchain,
} from "./androidToolchain.ts";
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
      detail: scrcpyInstalled ? undefined : "pacman -S scrcpy · apt install scrcpy · brew install scrcpy",
    });

    return steps.every((step) => step.done) ? { kind: "available" } : { kind: "setup-required", steps };
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
        await this.readFile(path.join(this.toolchain().avdHome, `${avdName}.avd`, "config.ini")).catch(
          () => "",
        ),
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

  /** Resolves the adb serial for a booted AVD; later tasks use this everywhere. */
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

  boot(_udid: string): Promise<DeviceDescriptor> { return this.notImplemented(); }
  shutdown(_udid: string): Promise<void> { return this.notImplemented(); }
  install(): Promise<never> { return this.notImplemented(); }
  launch(): Promise<never> { return this.notImplemented(); }
  openUrl(): Promise<never> { return this.notImplemented(); }
  tap(): Promise<never> { return this.notImplemented(); }
  swipe(): Promise<never> { return this.notImplemented(); }
  typeText(): Promise<never> { return this.notImplemented(); }
  keyEvent(): Promise<never> { return this.notImplemented(); }
  pressButton(): Promise<never> { return this.notImplemented(); }
  screenshot(): Promise<never> { return this.notImplemented(); }
  startRecording(): Promise<never> { return this.notImplemented(); }
  stopRecording(): Promise<never> { return this.notImplemented(); }
  describeUi(): Promise<never> { return this.notImplemented(); }
  attachStream(_udid: string, _onFrame: DeviceFrameListener): Promise<void> { return this.notImplemented(); }
  detachStream(_udid: string): Promise<void> { return this.notImplemented(); }
}
```

Adjust the placeholder method signatures to exactly match `DeviceBackend` (copy parameter lists from `DeviceBackend.ts:82-137`) so `implements DeviceBackend` typechecks — each body stays `return this.notImplemented();` until its task.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test apps/server/src/device/android/` — expected PASS.

- [ ] **Step 6: Bundled verification + commit**

```bash
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): android emulator backend with availability and discovery"
```

---

### Task 5: Boot and shutdown

**Files:**
- Modify: `apps/server/src/device/android/AndroidEmulatorBackend.ts` (replace `boot`/`shutdown` placeholders)
- Test: `apps/server/src/device/android/AndroidEmulatorBackend.test.ts`

**Interfaces:**
- Consumes: `serialFor`, `adbClient`, `spawnProcess`, `listDevices` from Task 4.
- Produces: working `boot(udid): Promise<DeviceDescriptor>` (spawns headless emulator, polls until booted) and `shutdown(udid): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```typescript
describe("AndroidEmulatorBackend.boot", () => {
  it("spawns a headless emulator and resolves when boot completes", async () => {
    let spawned: { command: string; args: readonly string[] } | null = null;
    let pollCount = 0;
    const backend = new AndroidEmulatorBackend({
      toolchain: FULL_TOOLCHAIN,
      bootPollIntervalMs: 0,
      spawnProcess: (command, args) => {
        spawned = { command, args };
        return { unref: () => {}, on: () => {}, kill: () => true } as never;
      },
      run: async (command, args) => {
        const key = [command, ...args].join(" ");
        if (key === "/sdk/emulator/emulator -list-avds") return ok("Pixel_8_API_35\n");
        if (key === "/sdk/platform-tools/adb devices") {
          pollCount += 1;
          return ok(pollCount < 2 ? "List of devices attached\n" : "List of devices attached\nemulator-5554\tdevice\n");
        }
        if (key === "/sdk/platform-tools/adb -s emulator-5554 emu avd name") return ok("Pixel_8_API_35\nOK\n");
        if (key === "/sdk/platform-tools/adb -s emulator-5554 shell getprop sys.boot_completed") return ok("1\n");
        throw new Error(`unexpected: ${key}`);
      },
      readFile: async () => "hw.lcd.width=1080\nhw.lcd.height=2340\nhw.lcd.density=440\n",
    });

    const descriptor = await backend.boot("Pixel_8_API_35");
    expect(descriptor.state).toBe("booted");
    expect(spawned?.command).toBe("/sdk/emulator/emulator");
    expect(spawned?.args).toEqual([
      "-avd", "Pixel_8_API_35", "-no-window", "-no-boot-anim", "-no-audio", "-gpu", "auto",
    ]);
  });
});
```

Add `bootPollIntervalMs?: number` and `bootDeadlineMs?: number` to `AndroidEmulatorBackendOptions` for testability.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test apps/server/src/device/android/AndroidEmulatorBackend.test.ts` — FAIL with "Not implemented for android-emulator yet".

- [ ] **Step 3: Implement**

```typescript
private static readonly BOOT_DEADLINE_MS = 180_000;
private static readonly BOOT_POLL_INTERVAL_MS = 2_000;

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

private sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}
```

Wire `bootDeadlineMs`/`bootPollIntervalMs` fields from options with the static defaults.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test apps/server/src/device/android/AndroidEmulatorBackend.test.ts` — expected PASS.

- [ ] **Step 5: Bundled verification + commit**

```bash
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): boot and shutdown android emulators headlessly"
```

---

### Task 6: install, launch, openUrl

**Files:**
- Modify: `apps/server/src/device/android/AndroidEmulatorBackend.ts`
- Create: `apps/server/src/device/android/apkPackageName.ts`
- Test: `apps/server/src/device/android/apkPackageName.test.ts`, extend `AndroidEmulatorBackend.test.ts`

**Interfaces:**
- Produces: `install(udid, appPath): Promise<DeviceInstallAppResult>`, `launch(udid, bundleId, launchArguments?): Promise<DeviceLaunchAppResult>`, `openUrl(udid, url)`. Helper: `resolveApkPackageName(options: { apkPath: string; sdkRoot: string; run: typeof runProcess; listBuildToolsDirs: () => Promise<readonly string[]> }): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

`apkPackageName.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { resolveApkPackageName } from "./apkPackageName";

describe("resolveApkPackageName", () => {
  it("uses aapt2 from the newest build-tools", async () => {
    const pkg = await resolveApkPackageName({
      apkPath: "/tmp/app.apk",
      sdkRoot: "/sdk",
      listBuildToolsDirs: async () => ["34.0.0", "35.0.0"],
      run: async (command, args) => {
        expect(command).toBe("/sdk/build-tools/35.0.0/aapt2");
        expect(args).toEqual(["dump", "packagename", "/tmp/app.apk"]);
        return { stdout: "com.example.fitness\n", stderr: "", code: 0, signal: null, timedOut: false };
      },
    });
    expect(pkg).toBe("com.example.fitness");
  });
});
```

Backend test: `install` runs `adb -s emulator-5554 install -r -t /tmp/app.apk` and returns `{ udid: "Pixel_8_API_35", bundleId: "com.example.fitness" }`; `launch` resolves the component via `cmd package resolve-activity --brief com.example.fitness`, starts it with `am start -W -n <component>`, and returns the `pidof` pid (script the fake `run` accordingly, following the Task 5 pattern).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test apps/server/src/device/android/` — FAIL.

- [ ] **Step 3: Implement `apkPackageName.ts`**

```typescript
import * as path from "node:path";
import type { runProcess } from "../../processRunner.ts";
import { DeviceBackendError } from "../DeviceBackend.ts";

export interface ResolveApkPackageNameOptions {
  readonly apkPath: string;
  readonly sdkRoot: string;
  readonly run: typeof runProcess;
  readonly listBuildToolsDirs: () => Promise<readonly string[]>;
}

function newestVersionFirst(versions: readonly string[]): readonly string[] {
  return [...versions].sort((left, right) =>
    right.localeCompare(left, undefined, { numeric: true }),
  );
}

export async function resolveApkPackageName(
  options: ResolveApkPackageNameOptions,
): Promise<string> {
  const versions = newestVersionFirst(await options.listBuildToolsDirs());
  for (const version of versions) {
    const aapt2 = path.join(options.sdkRoot, "build-tools", version, "aapt2");
    const result = await options
      .run(aapt2, ["dump", "packagename", options.apkPath], { allowNonZeroExit: true })
      .catch(() => null);
    if (result !== null && result.code === 0) {
      const pkg = result.stdout.trim().split("\n")[0]?.trim();
      if (pkg) return pkg;
    }
  }
  throw new DeviceBackendError(
    'Could not read the APK package name. Install build-tools: sdkmanager "build-tools;35.0.0"',
  );
}
```

- [ ] **Step 4: Implement the backend methods**

```typescript
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
  await this.adbClient().adb(["-s", serial, "install", "-r", "-t", appPath], { timeoutMs: 120_000 });
  return { udid, bundleId };
}

async launch(
  udid: string,
  bundleId: string,
  launchArguments: readonly string[] = [],
): Promise<DeviceLaunchAppResult> {
  const serial = await this.serialFor(udid);
  const adb = this.adbClient();
  const resolved = await adb.shell(serial, ["cmd", "package", "resolve-activity", "--brief", bundleId]);
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
  await this.adbClient().shell(serial, ["am", "start", "-a", "android.intent.action.VIEW", "-d", url]);
}

private async listBuildToolsDirs(sdkRoot: string): Promise<readonly string[]> {
  const { readdir } = await import("node:fs/promises");
  return readdir(path.join(sdkRoot, "build-tools")).catch(() => []);
}
```

- [ ] **Step 5: Run tests, bundled verification, commit**

```bash
bun run test apps/server/src/device/android/
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): install, launch and open urls on android emulators"
```

---

### Task 7: Input — tap, swipe, typeText, keyEvent, pressButton

**Files:**
- Modify: `apps/server/src/device/android/AndroidEmulatorBackend.ts`
- Create: `apps/server/src/device/android/androidKeys.ts`
- Test: `apps/server/src/device/android/androidKeys.test.ts`, extend `AndroidEmulatorBackend.test.ts`

**Interfaces:**
- Consumes: `DeviceSwipeGesture`, `DeviceKeyEvent`, `DeviceHardwareButton` from contracts/DeviceBackend; geometry cache from Task 4.
- Produces: all five input methods. Helpers: `hidUsageToAndroidKeyCode(usage: number): number | null`, `escapeForAdbInputText(text: string): string`, `ANDROID_HARDWARE_BUTTON_KEYCODES: Record<...>`.
- Coordinate contract: the pane sends **device points**; `adb shell input` takes **pixels**. Convert with `pixel = Math.round(point * geometry.scale)`. When the geometry cache is empty, fetch `displayGeometry(serial)` once and cache `androidGeometry(widthPx, heightPx, densityDpi)`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  ANDROID_HARDWARE_BUTTON_KEYCODES,
  escapeForAdbInputText,
  hidUsageToAndroidKeyCode,
} from "./androidKeys";

describe("hidUsageToAndroidKeyCode", () => {
  it("maps letters, digits and named keys", () => {
    expect(hidUsageToAndroidKeyCode(0x04)).toBe(29); // a
    expect(hidUsageToAndroidKeyCode(0x1d)).toBe(54); // z
    expect(hidUsageToAndroidKeyCode(0x1e)).toBe(8); // 1
    expect(hidUsageToAndroidKeyCode(0x27)).toBe(7); // 0
    expect(hidUsageToAndroidKeyCode(0x28)).toBe(66); // enter
    expect(hidUsageToAndroidKeyCode(0x2a)).toBe(67); // backspace
    expect(hidUsageToAndroidKeyCode(0x50)).toBe(21); // arrow left
    expect(hidUsageToAndroidKeyCode(0xff)).toBeNull();
  });
});

describe("escapeForAdbInputText", () => {
  it("encodes spaces and escapes device-shell metacharacters", () => {
    expect(escapeForAdbInputText("hi there")).toBe("hi%sthere");
    expect(escapeForAdbInputText("a&b(c)")).toBe("a\\&b\\(c\\)");
  });
});

describe("ANDROID_HARDWARE_BUTTON_KEYCODES", () => {
  it("covers home, lock and volume", () => {
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES.home).toBe(3);
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES.lock).toBe(26);
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES["volume-up"]).toBe(24);
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES["volume-down"]).toBe(25);
  });
});
```

Backend test: with geometry `{scale: 2.75}` cached (seed via `listDevices` script), `tap("Pixel_8_API_35", 100, 200)` runs `adb -s emulator-5554 shell input tap 275 550`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test apps/server/src/device/android/` — FAIL.

- [ ] **Step 3: Implement `androidKeys.ts`**

```typescript
import type { DeviceHardwareButton } from "@luminor/contracts";

const HID_LETTER_FIRST = 0x04;
const HID_LETTER_LAST = 0x1d;
const AKEYCODE_A = 29;
const HID_DIGIT_1 = 0x1e;
const HID_DIGIT_9 = 0x26;
const HID_DIGIT_0 = 0x27;
const AKEYCODE_1 = 8;
const AKEYCODE_0 = 7;

const NAMED_HID_TO_ANDROID: ReadonlyMap<number, number> = new Map([
  [0x28, 66], // enter
  [0x29, 111], // escape
  [0x2a, 67], // backspace
  [0x2b, 61], // tab
  [0x2c, 62], // space
  [0x2d, 69], // minus
  [0x2e, 70], // equals
  [0x33, 74], // semicolon
  [0x34, 75], // apostrophe
  [0x36, 55], // comma
  [0x37, 56], // period
  [0x38, 76], // slash
  [0x4c, 112], // forward delete
  [0x4f, 22], // arrow right
  [0x50, 21], // arrow left
  [0x51, 20], // arrow down
  [0x52, 19], // arrow up
]);

export function hidUsageToAndroidKeyCode(usage: number): number | null {
  if (usage >= HID_LETTER_FIRST && usage <= HID_LETTER_LAST) return AKEYCODE_A + (usage - HID_LETTER_FIRST);
  if (usage >= HID_DIGIT_1 && usage <= HID_DIGIT_9) return AKEYCODE_1 + (usage - HID_DIGIT_1);
  if (usage === HID_DIGIT_0) return AKEYCODE_0;
  return NAMED_HID_TO_ANDROID.get(usage) ?? null;
}

export const ANDROID_HARDWARE_BUTTON_KEYCODES: Partial<Record<DeviceHardwareButton, number>> = {
  home: 3,
  lock: 26,
  "volume-up": 24,
  "volume-down": 25,
};

export function escapeForAdbInputText(text: string): string {
  return text.replaceAll(/([\\'"`&|;<>()*~$])/gu, "\\$1").replaceAll(" ", "%s");
}
```

- [ ] **Step 4: Implement the backend methods**

```typescript
private async geometryFor(udid: string, serial: string): Promise<DeviceGeometry> {
  const cached = this.deviceGeometry.get(udid);
  if (cached) return cached;
  const display = await this.adbClient().displayGeometry(serial);
  const geometry = androidGeometry(display.widthPx, display.heightPx, display.densityDpi);
  this.deviceGeometry.set(udid, geometry);
  return geometry;
}

async tap(udid: string, x: number, y: number): Promise<void> {
  const serial = await this.serialFor(udid);
  const { scale } = await this.geometryFor(udid, serial);
  await this.adbClient().shell(serial, [
    "input", "tap", String(Math.round(x * scale)), String(Math.round(y * scale)),
  ]);
}

async swipe(udid: string, gesture: DeviceSwipeGesture): Promise<void> {
  const serial = await this.serialFor(udid);
  const { scale } = await this.geometryFor(udid, serial);
  await this.adbClient().shell(serial, [
    "input", "swipe",
    String(Math.round(gesture.fromX * scale)), String(Math.round(gesture.fromY * scale)),
    String(Math.round(gesture.toX * scale)), String(Math.round(gesture.toY * scale)),
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
```

- [ ] **Step 5: Run tests, bundled verification, commit**

```bash
bun run test apps/server/src/device/android/
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): hid input mapping for android emulators"
```

---

### Task 8: Screenshot and describeUi

**Files:**
- Modify: `apps/server/src/device/android/AndroidEmulatorBackend.ts`
- Create: `apps/server/src/device/android/pngDimensions.ts`, `apps/server/src/device/android/uiautomatorTree.ts`
- Test: `pngDimensions.test.ts`, `uiautomatorTree.test.ts`

**Interfaces:**
- Produces: `screenshot(udid, options?)` → `DeviceScreenshotResult` (base64 PNG); `describeUi(udid)` → `DeviceDescribeUiResult`. Helpers: `pngDimensions(bytes: Uint8Array): { width: number; height: number }`, `parseUiautomatorXml(xml: string, scale: number): DeviceUiNode`.
- Note: `runProcess` stdout is text-only — screenshots go device-file → `adb pull` → `readFile` (binary via `node:fs/promises.readFile` without encoding), never `exec-out`.

- [ ] **Step 1: Write the failing tests**

```typescript
// pngDimensions.test.ts
import { describe, expect, it } from "vitest";
import { pngDimensions } from "./pngDimensions";

describe("pngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(bytes.buffer).setUint32(16, 1080, false);
    new DataView(bytes.buffer).setUint32(20, 2340, false);
    expect(pngDimensions(bytes)).toEqual({ width: 1080, height: 2340 });
  });
});
```

```typescript
// uiautomatorTree.test.ts
import { describe, expect, it } from "vitest";
import { parseUiautomatorXml } from "./uiautomatorTree";

const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" content-desc="" checkable="false" checked="false" bounds="[0,0][1080,2340]">
    <node index="0" text="Save meal" resource-id="com.example:id/save" class="android.widget.Button" content-desc="Save the meal" checkable="false" checked="false" bounds="[110,2090][970,2222]" />
    <node index="1" text="" resource-id="" class="android.widget.Switch" content-desc="Dark mode" checkable="true" checked="true" bounds="[880,440][1040,530]" />
  </node>
</hierarchy>`;

describe("parseUiautomatorXml", () => {
  it("maps nodes to DeviceUiNode in device points", () => {
    const root = parseUiautomatorXml(XML, 2.75);
    expect(root.role).toBe("FrameLayout");
    expect(root.children).toHaveLength(2);

    const button = root.children[0];
    expect(button?.role).toBe("Button");
    expect(button?.label).toBe("Save the meal");
    expect(button?.value).toBe("Save meal");
    expect(button?.frame).toEqual({ x: 40, y: 760, width: 313, height: 48 });

    const toggle = root.children[1];
    expect(toggle?.role).toBe("Switch");
    expect(toggle?.value).toBe("1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** — `bun run test apps/server/src/device/android/` → FAIL.

- [ ] **Step 3: Implement `pngDimensions.ts`**

```typescript
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 24) throw new Error("Not a PNG: too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x89504e47) throw new Error("Not a PNG: bad signature");
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}
```

- [ ] **Step 4: Implement `uiautomatorTree.ts`** (stack parser — uiautomator XML is flat `<node>` nesting with double-quoted attributes)

```typescript
import type { DeviceUiNode } from "@luminor/contracts";

const TAG_PATTERN = /<node\b([^>]*?)(\/?)>|<\/node>/gu;
const ATTRIBUTE_PATTERN = /([\w-]+)="([^"]*)"/gu;
const BOUNDS_PATTERN = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/u;

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;", "&");
}

interface MutableUiNode {
  role: string;
  subrole: string | null;
  label: string | null;
  value: string | null;
  frame: { x: number; y: number; width: number; height: number };
  activationPoint: null;
  children: MutableUiNode[];
}

function nodeFromAttributes(raw: string, scale: number): MutableUiNode {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) {
    attributes.set(match[1] ?? "", unescapeXml(match[2] ?? ""));
  }
  const bounds = BOUNDS_PATTERN.exec(attributes.get("bounds") ?? "");
  const [left, top, right, bottom] = bounds
    ? [Number(bounds[1]), Number(bounds[2]), Number(bounds[3]), Number(bounds[4])]
    : [0, 0, 0, 0];
  const className = attributes.get("class") ?? "";
  const text = attributes.get("text") ?? "";
  const contentDesc = attributes.get("content-desc") ?? "";
  const checkable = attributes.get("checkable") === "true";
  const label = contentDesc !== "" ? contentDesc : text !== "" ? text : null;
  const value = checkable
    ? attributes.get("checked") === "true"
      ? "1"
      : "0"
    : contentDesc !== "" && text !== ""
      ? text
      : null;
  return {
    role: className.split(".").at(-1) || "View",
    subrole: null,
    label,
    value,
    frame: {
      x: Math.round(left / scale),
      y: Math.round(top / scale),
      width: Math.round((right - left) / scale),
      height: Math.round((bottom - top) / scale),
    },
    activationPoint: null,
    children: [],
  };
}

export function parseUiautomatorXml(xml: string, scale: number): DeviceUiNode {
  const stack: MutableUiNode[] = [];
  const roots: MutableUiNode[] = [];
  for (const match of xml.matchAll(TAG_PATTERN)) {
    if (match[0] === "</node>") {
      const closed = stack.pop();
      if (closed && stack.length === 0) roots.push(closed);
      continue;
    }
    const node = nodeFromAttributes(match[1] ?? "", scale);
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else if (match[2] === "/") roots.push(node);
    if (match[2] !== "/") stack.push(node);
  }
  const root = roots[0];
  if (!root) throw new Error("uiautomator dump contained no nodes");
  return root;
}
```

- [ ] **Step 5: Implement the backend methods**

```typescript
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
    await this.adbClient().adb(["-s", serial, "pull", devicePath, localPath], { timeoutMs: 30_000 });
    const bytes = await readFile(localPath);
    const { width, height } = pngDimensions(bytes);
    const capturedAt = new Date(this.now()).toISOString();
    const name = `${udid}-${capturedAt.replaceAll(/[:.]/gu, "-")}.png`;
    let savedPath: string | undefined;
    if (options?.save === true) {
      const { copyFile, mkdir } = await import("node:fs/promises");
      const directory = await this.recordingDirectory();
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
    await this.adbClient().shell(serial, ["rm", "-f", devicePath]).catch(() => {});
  }
}

async describeUi(udid: string): Promise<DeviceDescribeUiResult> {
  const serial = await this.serialFor(udid);
  const { scale } = await this.geometryFor(udid, serial);
  const devicePath = "/data/local/tmp/luminor-uidump.xml";
  await this.adbClient().shell(serial, ["uiautomator", "dump", devicePath], { timeoutMs: 30_000 });
  const xml = await this.adbClient().shell(serial, ["cat", devicePath]);
  await this.adbClient().shell(serial, ["rm", "-f", devicePath]).catch(() => {});
  return {
    udid,
    capturedAt: new Date(this.now()).toISOString(),
    root: parseUiautomatorXml(xml, scale),
  };
}
```

`recordingDirectory()` arrives in Task 9 — for this task, save uses `this.recordingDirectoryOverride ?? tmpdir()` inline; Task 9 replaces it.

- [ ] **Step 6: Run tests, bundled verification, commit**

```bash
bun run test apps/server/src/device/android/
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): android screenshots and accessibility tree dumps"
```

---

### Task 9: Screen recording

**Files:**
- Modify: `apps/server/src/device/android/AndroidEmulatorBackend.ts`
- Read first: `apps/server/src/device/IosSimulatorBackend.ts:876-915` (`recordingDirectory()` + default recording path constants)

**Interfaces:**
- Produces: `startRecording(udid)` → `DeviceStartRecordingResult`, `stopRecording(udid)` → `DeviceStopRecordingResult`.
- Consumes: the iOS backend's recording-directory default. Extract it: move the default-path logic from `IosSimulatorBackend.recordingDirectory()` into `apps/server/src/device/recordingPaths.ts` as `resolveDeviceRecordingDirectory(override: string | undefined): Promise<string>`, and call it from BOTH backends (this is the shared-logic extraction the repo's maintainability policy requires).

- [ ] **Step 1: Extract `resolveDeviceRecordingDirectory`** — move (not copy) the body of `IosSimulatorBackend.recordingDirectory()` (line 902) into the new module, update the iOS backend to call it, run `bun run test apps/server/src/device/IosSimulatorBackend.test.ts` to confirm no regression.

- [ ] **Step 2: Write the failing test** — script a fake `run` where `startRecording` spawns `adb -s emulator-5554 shell screenrecord --bugreport /data/local/tmp/<name>.mp4` via `spawnProcess` (records the call) and returns `{ udid, path, startedAt }` with `path` under the override directory; `stopRecording` kills the child, pulls the file, and returns measured `durationMs > 0`.

- [ ] **Step 3: Implement**

```typescript
private readonly activeRecordings = new Map<
  string,
  { child: ChildProcess; devicePath: string; localPath: string; startedAtMs: number }
>();

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
  await this.adbClient().shell(serial, ["rm", "-f", active.devicePath]).catch(() => {});
  const sizeBytes = await stat(active.localPath).then((s) => s.size).catch(() => 0);
  const stoppedAtMs = this.now();
  return {
    udid,
    path: active.localPath,
    sizeBytes,
    durationMs: Math.max(0, stoppedAtMs - active.startedAtMs),
    stoppedAt: new Date(stoppedAtMs).toISOString(),
  };
}
```

Known limitation to accept: `screenrecord` caps at 3 minutes per file; a recording running past that finalizes on the device and `stopRecording` still pulls it.

- [ ] **Step 4: Run tests, bundled verification, commit**

```bash
bun run test apps/server/src/device/
bun fmt && bun lint && bun typecheck
git add apps/server/src/device
git commit -m "feat(server): android screen recording via adb screenrecord"
```

---

### Task 10: Live video — Annex B parser + scrcpy stream + attach/detach

**Files:**
- Create: `apps/server/src/device/android/annexB.ts`, `apps/server/src/device/android/ScrcpyStream.ts`
- Modify: `apps/server/src/device/android/AndroidEmulatorBackend.ts` (`attachStream`, `detachStream`, `dispose`)
- Test: `annexB.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // annexB.ts
  class AnnexBSplitter { push(chunk: Uint8Array): readonly Uint8Array[] } // complete NALs incl. 4-byte start code
  function nalUnitType(nal: Uint8Array): number
  function avccFromAnnexB(nal: Uint8Array): Uint8Array          // contingency: length-prefixed
  function buildAvcCDescription(sps: Uint8Array, pps: Uint8Array): Uint8Array
  // ScrcpyStream.ts
  class ScrcpyStream {
    static start(options: ScrcpyStreamOptions): Promise<ScrcpyStream>;
    stop(): Promise<void>;
  }
  interface ScrcpyStreamOptions {
    adbPath: string; serial: string; serverJarPath: string; serverVersion: string;
    maxFps?: number; onFrame: DeviceFrameListener; run: typeof runProcess;
  }
  ```
- **Bitstream-format gate (do this FIRST):** read `apps/web/src/components/device/useDeviceVideoStream.ts` and confirm what the decoder expects from `codecConfig` frames (the iOS helper feeds the same pipe). If it consumes Annex B (start-code) payloads, ship NALs as-is. If it configures `VideoDecoder` with an `avcC` description and length-prefixed samples, convert with `buildAvcCDescription`/`avccFromAnnexB` before emitting. Both converters are provided below so this is a branch, not a research stall.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { AnnexBSplitter, buildAvcCDescription, nalUnitType } from "./annexB";

const nal = (type: number, ...body: number[]) => new Uint8Array([0, 0, 0, 1, type, ...body]);

describe("AnnexBSplitter", () => {
  it("splits across chunk boundaries and identifies NAL types", () => {
    const splitter = new AnnexBSplitter();
    const stream = new Uint8Array([
      ...nal(0x67, 1, 2), // SPS
      ...nal(0x68, 3), // PPS
      ...nal(0x65, 4, 5, 6), // IDR
      ...nal(0x41, 7), // non-IDR slice
    ]);
    const nals = [
      ...splitter.push(stream.subarray(0, 5)),
      ...splitter.push(stream.subarray(5, 13)),
      ...splitter.push(stream.subarray(13)),
      ...splitter.flush(),
    ];
    expect(nals.map((unit) => nalUnitType(unit))).toEqual([7, 8, 5, 1]);
  });
});

describe("buildAvcCDescription", () => {
  it("wraps sps/pps in an avcC box", () => {
    const sps = new Uint8Array([0x67, 0x64, 0x00, 0x28, 0xac]);
    const pps = new Uint8Array([0x68, 0xee, 0x38, 0x80]);
    const avcc = buildAvcCDescription(sps, pps);
    expect(avcc[0]).toBe(1);
    expect([avcc[1], avcc[2], avcc[3]]).toEqual([0x64, 0x00, 0x28]);
    expect(avcc[4]).toBe(0xff);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL, module not found.

- [ ] **Step 3: Implement `annexB.ts`**

```typescript
const START_CODE = new Uint8Array([0, 0, 0, 1]);

export function nalUnitType(nal: Uint8Array): number {
  const offset = nal[2] === 1 ? 3 : 4;
  return (nal[offset] ?? 0) & 0x1f;
}

export class AnnexBSplitter {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): readonly Uint8Array[] {
    const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.byteLength);

    const starts: number[] = [];
    for (let index = 0; index + 3 <= merged.byteLength; index += 1) {
      if (merged[index] !== 0 || merged[index + 1] !== 0) continue;
      if (merged[index + 2] === 1) {
        starts.push(index);
        index += 2;
      } else if (merged[index + 2] === 0 && merged[index + 3] === 1) {
        starts.push(index);
        index += 3;
      }
    }

    if (starts.length <= 1) {
      this.buffer = merged;
      return [];
    }
    const units: Uint8Array[] = [];
    for (let unit = 0; unit < starts.length - 1; unit += 1) {
      units.push(merged.slice(starts[unit], starts[unit + 1]));
    }
    this.buffer = merged.slice(starts.at(-1) ?? 0);
    return units;
  }

  flush(): readonly Uint8Array[] {
    const rest = this.buffer;
    this.buffer = new Uint8Array(0);
    return rest.byteLength > 4 ? [rest] : [];
  }
}

function stripStartCode(nal: Uint8Array): Uint8Array {
  return nal.subarray(nal[2] === 1 ? 3 : 4);
}

export function avccFromAnnexB(nal: Uint8Array): Uint8Array {
  const body = stripStartCode(nal);
  const out = new Uint8Array(4 + body.byteLength);
  new DataView(out.buffer).setUint32(0, body.byteLength, false);
  out.set(body, 4);
  return out;
}

export function buildAvcCDescription(spsWithHeader: Uint8Array, ppsWithHeader: Uint8Array): Uint8Array {
  const sps = spsWithHeader[2] === 1 || spsWithHeader[3] === 1 ? stripStartCode(spsWithHeader) : spsWithHeader;
  const pps = ppsWithHeader[2] === 1 || ppsWithHeader[3] === 1 ? stripStartCode(ppsWithHeader) : ppsWithHeader;
  const out = new Uint8Array(11 + sps.byteLength + pps.byteLength);
  const view = new DataView(out.buffer);
  out[0] = 1;
  out[1] = sps[1] ?? 0;
  out[2] = sps[2] ?? 0;
  out[3] = sps[3] ?? 0;
  out[4] = 0xff;
  out[5] = 0xe1;
  view.setUint16(6, sps.byteLength, false);
  out.set(sps, 8);
  out[8 + sps.byteLength] = 1;
  view.setUint16(9 + sps.byteLength, pps.byteLength, false);
  out.set(pps, 11 + sps.byteLength);
  return out;
}

export const NAL_TYPE_IDR = 5;
export const NAL_TYPE_SEI = 6;
export const NAL_TYPE_SPS = 7;
export const NAL_TYPE_PPS = 8;
export const NAL_TYPE_SLICE = 1;

export { START_CODE };
```

- [ ] **Step 4: Implement `ScrcpyStream.ts`**

```typescript
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { connect, type Socket } from "node:net";

import type { runProcess } from "../../processRunner.ts";
import { DeviceBackendError, type DeviceFrameListener } from "../DeviceBackend.ts";
import {
  AnnexBSplitter,
  NAL_TYPE_IDR,
  NAL_TYPE_PPS,
  NAL_TYPE_SEI,
  NAL_TYPE_SLICE,
  NAL_TYPE_SPS,
  nalUnitType,
} from "./annexB.ts";

export interface ScrcpyStreamOptions {
  readonly adbPath: string;
  readonly serial: string;
  readonly serverJarPath: string;
  readonly serverVersion: string;
  readonly maxFps?: number;
  readonly onFrame: DeviceFrameListener;
  readonly run: typeof runProcess;
}

const DEVICE_JAR_PATH = "/data/local/tmp/luminor-scrcpy-server.jar";
const CONNECT_ATTEMPTS = 50;
const CONNECT_RETRY_MS = 100;

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export class ScrcpyStream {
  private constructor(
    private readonly options: ScrcpyStreamOptions,
    private readonly serverProcess: ChildProcess,
    private readonly socket: Socket,
    private readonly localPort: number,
  ) {}

  static async start(options: ScrcpyStreamOptions): Promise<ScrcpyStream> {
    await options.run(options.adbPath, ["-s", options.serial, "push", options.serverJarPath, DEVICE_JAR_PATH]);
    const scid = Array.from({ length: 8 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    const forwardOut = await options.run(options.adbPath, [
      "-s", options.serial, "forward", "tcp:0", `localabstract:scrcpy_${scid}`,
    ]);
    const localPort = Number.parseInt(forwardOut.stdout.trim(), 10);
    if (!Number.isFinite(localPort) || localPort <= 0) {
      throw new DeviceBackendError(`adb forward did not return a port: ${forwardOut.stdout.trim()}`);
    }

    // scrcpy protocol invariant: raw_stream=true skips the handshake bytes and
    // device metadata entirely; the socket carries a bare Annex B H.264 stream.
    const serverProcess = spawn(
      options.adbPath,
      [
        "-s", options.serial, "shell",
        `CLASSPATH=${DEVICE_JAR_PATH}`, "app_process", "/", "com.genymobile.scrcpy.Server",
        options.serverVersion,
        `scid=${scid}`,
        "log_level=warn",
        "video=true", "audio=false", "control=false",
        "video_codec=h264", "raw_stream=true", "tunnel_forward=true",
        `max_fps=${options.maxFps ?? 60}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );

    const socket = await ScrcpyStream.connectWithRetry(localPort);
    const stream = new ScrcpyStream(options, serverProcess, socket, localPort);
    stream.pump();
    return stream;
  }

  private static connectWithRetry(port: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      let attempt = 0;
      const tryConnect = (): void => {
        attempt += 1;
        const socket = connect({ host: "127.0.0.1", port });
        socket.once("connect", () => resolve(socket));
        socket.once("error", () => {
          socket.destroy();
          if (attempt >= CONNECT_ATTEMPTS) {
            reject(new DeviceBackendError("Could not connect to the scrcpy video socket.", { retryable: true }));
            return;
          }
          setTimeout(tryConnect, CONNECT_RETRY_MS);
        });
      };
      tryConnect();
    });
  }

  private pump(): void {
    const splitter = new AnnexBSplitter();
    let sequence = 0;
    let pendingConfig: Uint8Array[] = [];
    let pendingSei: Uint8Array[] = [];

    this.socket.on("data", (chunk: Buffer) => {
      for (const nal of splitter.push(new Uint8Array(chunk))) {
        const type = nalUnitType(nal);
        if (type === NAL_TYPE_SPS || type === NAL_TYPE_PPS) {
          pendingConfig.push(nal);
          if (type === NAL_TYPE_PPS && pendingConfig.length >= 2) {
            sequence += 1;
            this.options.onFrame({
              sequence,
              timestampMs: Date.now(),
              keyframe: false,
              codecConfig: true,
              data: concat(pendingConfig),
            });
            pendingConfig = [];
          }
          continue;
        }
        if (type === NAL_TYPE_SEI) {
          pendingSei.push(nal);
          continue;
        }
        if (type === NAL_TYPE_IDR || type === NAL_TYPE_SLICE) {
          sequence += 1;
          this.options.onFrame({
            sequence,
            timestampMs: Date.now(),
            keyframe: type === NAL_TYPE_IDR,
            codecConfig: false,
            data: pendingSei.length > 0 ? concat([...pendingSei, nal]) : nal,
          });
          pendingSei = [];
        }
      }
    });
  }

  async stop(): Promise<void> {
    this.socket.destroy();
    this.serverProcess.kill("SIGKILL");
    await this.options
      .run(this.options.adbPath, ["-s", this.options.serial, "forward", "--remove", `tcp:${this.localPort}`])
      .catch(() => {});
  }
}
```

- [ ] **Step 5: Resolve the server version and wire attach/detach on the backend**

```typescript
private streams = new Map<string, ScrcpyStream>();
private scrcpyVersion: string | null = null;

private async resolveScrcpyVersion(): Promise<string> {
  if (this.scrcpyVersion !== null) return this.scrcpyVersion;
  const fromEnv = process.env.SCRCPY_SERVER_VERSION?.trim();
  if (fromEnv) return (this.scrcpyVersion = fromEnv);
  const result = await this.run("scrcpy", ["--version"], { allowNonZeroExit: true }).catch(() => null);
  const match = result === null ? null : /scrcpy\s+([\d.]+)/u.exec(result.stdout);
  if (!match?.[1]) {
    throw new DeviceBackendError(
      "Could not determine the scrcpy version. Install scrcpy or set SCRCPY_SERVER_VERSION.",
    );
  }
  return (this.scrcpyVersion = match[1]);
}

async attachStream(udid: string, onFrame: DeviceFrameListener): Promise<void> {
  const toolchain = this.toolchain();
  if (toolchain.adbPath === null || toolchain.scrcpyServerPath === null) {
    throw new DeviceBackendError("scrcpy is not installed; complete the Android setup steps first.");
  }
  const serial = await this.serialFor(udid);
  await this.geometryFor(udid, serial);
  await this.detachStream(udid);
  const stream = await ScrcpyStream.start({
    adbPath: toolchain.adbPath,
    serial,
    serverJarPath: toolchain.scrcpyServerPath,
    serverVersion: await this.resolveScrcpyVersion(),
    onFrame,
    run: this.run,
  });
  this.streams.set(udid, stream);
}

async detachStream(udid: string): Promise<void> {
  const stream = this.streams.get(udid);
  if (!stream) return;
  this.streams.delete(udid);
  await stream.stop();
}
```

Extend `dispose()` to stop every stream and kill active recordings. Note: a repeated `attachStream` restarts the scrcpy server, which always re-emits SPS/PPS + IDR — this is exactly what the manager's resync path (`device.frame.resync` → restart capture) relies on.

- [ ] **Step 6: Run the bitstream-format gate check** — read `apps/web/src/components/device/useDeviceVideoStream.ts`; if the decoder wants avcC + length-prefixed samples, apply `buildAvcCDescription(sps, pps)` for the codecConfig frame payload and `avccFromAnnexB` for slices inside `pump()`.

- [ ] **Step 7: Run tests, bundled verification, commit**

```bash
bun run test apps/server/src/device/android/
bun fmt && bun lint && bun typecheck
git add apps/server/src/device/android
git commit -m "feat(server): scrcpy-backed live video stream for android emulators"
```

---

### Task 11: Server wiring — backend selection, supported flag, env capability

**Files:**
- Modify: `apps/server/src/device/Layers/DeviceService.ts:40-76`
- Modify: `apps/server/src/environment/Layers/ServerEnvironment.ts:76-79` (capabilities literal)
- Test: extend the existing tests for `makeDeviceServiceLayer` (search `apps/server/src` for its test file; create `apps/server/src/device/Layers/DeviceService.test.ts` if none exists)

**Interfaces:**
- Consumes: `AndroidEmulatorBackend` (Task 4-10).
- Produces: on darwin → `IosSimulatorBackend` (unchanged); on every other platform → `AndroidEmulatorBackend`; `supported: true` on all platforms; boot-ownership store + orphan reclaim active on all platforms; env descriptor advertises `capabilities.devicePane: true`.

- [ ] **Step 1: Write the failing test**

```typescript
it("builds an android backend with supported=true off darwin", async () => {
  const layer = makeDeviceServiceLayer({ platform: "linux" });
  const service = await Effect.runPromise(
    Effect.scoped(Layer.build(layer).pipe(Effect.map((services) => ServiceMap.get(services, DeviceService)))),
  );
  expect(service.supported).toBe(true);
});
```

(Match the Effect test idioms already used in `apps/server/src/device/Layers/` or sibling layer tests — build the layer in a scope and read the service.)

- [ ] **Step 2: Run test to verify it fails** — `supported` is `false` off darwin today.

- [ ] **Step 3: Implement**

In `makeDeviceServiceLayer`:

```typescript
const platform = options.platform ?? process.platform;
const backend =
  platform === "darwin"
    ? new IosSimulatorBackend({ platform })
    : new AndroidEmulatorBackend();
const bootOwnership = makeBootOwnershipStore(
  options.bootOwnershipPath ?? defaultBootOwnershipPath(),
);
const manager = new DeviceManager({ backend, bootOwnership });

yield* Effect.promise(async () => {
  const reclaimed = await manager.reclaimOrphanedBoots().catch(() => []);
  if (reclaimed.length > 0) {
    console.info(
      `[device] shut down ${reclaimed.length} device(s) left booted by a previous ` +
        `Synara run: ${reclaimed.join(", ")}`,
    );
  }
});

yield* Effect.addFinalizer(() => Effect.promise(() => manager.dispose()));
return { supported: true, manager } satisfies DeviceServiceShape;
```

(The darwin-only guards around boot ownership and reclaim are removed — both are now platform-generic. `NULL_BOOT_OWNERSHIP` import goes away.)

In `ServerEnvironment.ts`:

```typescript
capabilities: {
  repositoryIdentity: true,
  devicePane: true,
},
```

- [ ] **Step 4: Run the device test suites** — `bun run test apps/server/src/device/` — expected PASS (the manager suites run against `FakeDeviceBackend` and are unaffected; fix any layer test that asserted `supported === false` off darwin — those assertions now flip).

- [ ] **Step 5: Bundled verification + commit**

```bash
bun fmt && bun lint && bun typecheck
git add apps/server/src
git commit -m "feat(server): select android emulator backend off darwin"
```

---

### Task 12: Web — support gate, pane label, Android setup copy

**Files:**
- Modify: `apps/web/src/hooks/useDeviceSupport.ts`
- Modify: `apps/web/src/components/chat/rightDockPaneMeta.tsx:46-49` (+ its `:125` gate input if the label needs the server OS plumbed)
- Modify: `apps/web/src/components/DevicePanel.logic.ts:749` (`DEVICE_SETUP_ACTIONS`), `:770` (`deviceSetupCheckingLabel`)
- Test: `apps/web/src/components/DevicePanel.logic.test.ts` (existing), `apps/web/src/components/chat/rightDockPaneMeta.test.ts` (existing)

**Interfaces:**
- Produces: `useDeviceSupport(): boolean` true whenever the server advertises `capabilities.devicePane` (fallback: `os === "darwin"` for older servers); exported `devicePaneLabel(serverOs: string | null | undefined): string`.

- [ ] **Step 1: Write the failing tests**

```typescript
// rightDockPaneMeta.test.ts additions
it("labels the device pane per server platform", () => {
  expect(devicePaneLabel("darwin")).toBe("iOS Simulator");
  expect(devicePaneLabel("linux")).toBe("Android Emulator");
  expect(devicePaneLabel(null)).toBe("Android Emulator");
});
```

```typescript
// DevicePanel.logic.test.ts additions
it("offers a download action for the android sdk step", () => {
  const action = resolveDeviceSetupAction([
    { id: "install-android-sdk", label: "Install the Android SDK", done: false },
  ]);
  expect(action?.url).toContain("developer.android.com");
});

it("labels the checking state for android", () => {
  expect(
    deviceSetupCheckingLabel([
      { id: "install-android-sdk", label: "Install the Android SDK", done: false },
    ]),
  ).toBe("Checking for the Android SDK…");
});
```

- [ ] **Step 2: Run tests to verify they fail** — `bun run test apps/web/src/components/` → FAIL.

- [ ] **Step 3: Implement**

`useDeviceSupport.ts`:

```typescript
export function useDeviceSupport(): boolean {
  const environmentQuery = useQuery(serverEnvironmentQueryOptions());
  const environment = environmentQuery.data;
  if (!environment) return false;
  return environment.capabilities.devicePane === true || environment.platform.os === "darwin";
}
```

`rightDockPaneMeta.tsx` — export the label helper and use it where the static `device: { label: "iOS Simulator", ... }` entry is consumed (read the file; the meta map is at line 46-49 and the `hasDeviceSupport` gate at line 125 — plumb the server OS the same way `hasDeviceSupport` reaches it, sourced from `serverEnvironmentQueryOptions` in the caller, `apps/web/src/components/chat/SingleChatSurface.tsx:190`):

```typescript
export function devicePaneLabel(serverOs: string | null | undefined): string {
  return serverOs === "darwin" ? "iOS Simulator" : "Android Emulator";
}
```

`DevicePanel.logic.ts`:

```typescript
const DEVICE_SETUP_ACTIONS: Partial<Record<DeviceSetupStepId, DeviceSetupAction>> = {
  "install-xcode": {
    label: "Open Mac App Store",
    url: "https://apps.apple.com/app/xcode/id497799835",
  },
  "install-android-sdk": {
    label: "Get the command line tools",
    url: "https://developer.android.com/studio#command-line-tools-only",
  },
  "install-scrcpy": {
    label: "Install scrcpy",
    url: "https://github.com/Genymobile/scrcpy/blob/master/doc/linux.md",
  },
};
```

```typescript
export function deviceSetupCheckingLabel(steps: readonly DeviceSetupStep[]): string | null {
  const next = steps.find((step) => !step.done);
  if (!next) return null;
  if (next.id === "install-xcode") return "Checking for Xcode…";
  if (next.id === "install-android-sdk") return "Checking for the Android SDK…";
  return "Checking your setup…";
}
```

Audit `apps/web/src/components/DevicePanel.tsx` for hardcoded "Simulator"/"iOS" copy in empty states, tooltips, and error strings; route any user-visible ones through the attached device's `platform` (the `deviceKindFor` call at `DevicePanel.tsx:464` already handles the chassis).

- [ ] **Step 4: Run tests to verify they pass** — `bun run test apps/web/src/components/` → PASS.

- [ ] **Step 5: Bundled verification + commit**

```bash
bun fmt && bun lint && bun typecheck
git add apps/web
git commit -m "feat(web): android emulator label, support gate and setup copy"
```

---

### Task 13: End-to-end runtime verification on this machine

**Files:** none (verification only; fix-forward anything found).

This machine already has Android Studio + the SDK installed (`~/Android/Sdk`). scrcpy may need `sudo pacman -S scrcpy`.

- [ ] **Step 1: Full suite** — `bun run test` (expect pre-existing failures only: wsTransport/Sidebar.logic/appSettings fail on main per project memory), then `bun fmt && bun lint && bun typecheck`.

- [ ] **Step 2: Preconditions** — `~/Android/Sdk/platform-tools/adb --version` works; `~/Android/Sdk/emulator/emulator -list-avds` lists ≥1 AVD (create one with the `avdmanager` command from Task 4's setup-step detail if empty); `scrcpy --version` works.

- [ ] **Step 3: Runtime pass (use the `verify` skill to launch Luminor locally)** — in the app:
  1. Open a thread → add pane → entry reads **"Android Emulator"** (not hidden, not "iOS Simulator").
  2. If scrcpy/AVD missing, the setup checklist shows Android steps with working detail commands.
  3. Pick the AVD → boot → live video renders inside the `androidPhone` chassis.
  4. Click on the screen → tap lands in the right place (coordinate scaling correct — this is the highest-risk item; verify by tapping a small target near a corner).
  5. Screenshot button returns a PNG; `device_describe_ui` (via an agent turn or WS call) returns a tree with sane point-space frames.
  6. Close the pane / let it idle → the manager shuts the emulator down (it booted it, `bootSource` synara).

- [ ] **Step 4: Commit any fixes** — `git commit -m "fix(server): android device pane runtime fixes"` per finding.

---

## Self-Review Notes

- **Spec coverage:** pane visible off-darwin (Tasks 1, 11, 12), spin up emulator from pane (5), live view (10), interact (7), agent tooling parity — list/boot/install/launch/screenshot/describe/record (4-9), setup checklist instead of Android Studio (4, 12). Physical S24 explicitly deferred.
- **Type consistency:** udid = AVD name everywhere; geometry `{pointWidth, pointHeight, scale}` matches `DeviceGeometry`; all backend method signatures copied from `DeviceBackend.ts:82-137`.
- **Known risks called out inline:** WebCodecs bitstream format (Task 10 gate, both branches implemented), scrcpy version arg matching the jar (env override provided), `screenrecord` 3-minute cap (documented), exhaustiveness fallout from widened literals (Task 1 Step 4).
