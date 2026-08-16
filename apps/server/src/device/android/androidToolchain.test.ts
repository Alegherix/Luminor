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

  it("falls back to the luminor-local scrcpy server jar", () => {
    const toolchain = probeAndroidToolchain({
      env: {},
      platform: "linux",
      homeDir: "/home/u",
      exists: fakeFs(["/home/u/.local/share/luminor/scrcpy-server"]),
    });
    expect(toolchain.scrcpyServerPath).toBe("/home/u/.local/share/luminor/scrcpy-server");
  });
});
