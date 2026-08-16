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
