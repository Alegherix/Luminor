import { describe, expect, it, vi } from "vitest";

import {
  loadMeetingsLoopback,
  MEETINGS_LOOPBACK_DESCRIPTION,
  MEETINGS_LOOPBACK_SOURCE_PREFIX,
  parseDefaultSink,
  parseLoopbackModules,
  unloadMeetingsLoopback,
  type MeetingsLoopbackExecFile,
} from "./meetingsLoopback";

const FIXTURE_INFO = `Server String: /run/user/1000/pulse/native
Default Sink: alsa_output.pci-0000_00_1f.3.analog-stereo
Default Source: alsa_input.pci-0000_00_1f.3.analog-stereo
`;

describe("meetings loopback parsers", () => {
  it("reads the Pulse default sink", () => {
    expect(parseDefaultSink(FIXTURE_INFO)).toBe("alsa_output.pci-0000_00_1f.3.analog-stereo");
  });

  it("keeps only Luminor remap-source modules", () => {
    const stdout = [
      `9\tmodule-remap-source\tmaster=other.monitor source_name=other_loopback source_properties=device.description=Other\t0`,
      `12\tmodule-remap-source\tmaster=alsa_output.default.monitor source_name=${MEETINGS_LOOPBACK_SOURCE_PREFIX}99 source_properties=device.description=${MEETINGS_LOOPBACK_DESCRIPTION}\t0`,
    ].join("\n");
    expect(parseLoopbackModules(stdout)).toEqual([
      {
        moduleId: "12",
        sourceName: `${MEETINGS_LOOPBACK_SOURCE_PREFIX}99`,
        description: MEETINGS_LOOPBACK_DESCRIPTION,
        master: "alsa_output.default.monitor",
      },
    ]);
  });
});

describe("loadMeetingsLoopback", () => {
  it("loads a remap source for the default sink monitor without a picker", async () => {
    const calls: string[][] = [];
    const exec: MeetingsLoopbackExecFile = vi.fn(async (_file, args) => {
      calls.push([...args]);
      if (args[0] === "list") {
        return { stdout: "" };
      }
      if (args[0] === "info") {
        return { stdout: FIXTURE_INFO };
      }
      if (args[0] === "load-module") {
        return { stdout: "123\n" };
      }
      throw new Error(`unexpected pactl call: ${args.join(" ")}`);
    });

    const result = await loadMeetingsLoopback({ execFile: exec, pid: 4242 });

    expect(result.ok).toBe(true);
    expect(result.module).toEqual({
      moduleId: "123",
      sourceName: `${MEETINGS_LOOPBACK_SOURCE_PREFIX}4242`,
      description: MEETINGS_LOOPBACK_DESCRIPTION,
      master: "alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
    });
    expect(calls.find((args) => args[0] === "load-module")).toEqual([
      "load-module",
      "module-remap-source",
      "master=alsa_output.pci-0000_00_1f.3.analog-stereo.monitor",
      `source_name=${MEETINGS_LOOPBACK_SOURCE_PREFIX}4242`,
      `source_properties=device.description=${MEETINGS_LOOPBACK_DESCRIPTION}`,
    ]);
  });

  it("returns ok:false when pactl cannot load the module", async () => {
    const exec: MeetingsLoopbackExecFile = vi.fn(async (_file, args) => {
      if (args[0] === "list") {
        return { stdout: "" };
      }
      if (args[0] === "info") {
        return { stdout: FIXTURE_INFO };
      }
      throw { code: "ELOAD", message: "load failed" };
    });

    const result = await loadMeetingsLoopback({ execFile: exec, pid: 1 });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/load failed/);
  });

  it("rejects non-numeric unload ids before exec", async () => {
    const exec: MeetingsLoopbackExecFile = vi.fn(async () => ({ stdout: "" }));

    const result = await unloadMeetingsLoopback("1; rm -rf /", { execFile: exec });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/module id/i);
    expect(exec).not.toHaveBeenCalled();
  });
});
