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
      toolchain: {
        sdkRoot: null,
        adbPath: null,
        emulatorPath: null,
        avdHome: "/avd",
        scrcpyServerPath: null,
      },
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
