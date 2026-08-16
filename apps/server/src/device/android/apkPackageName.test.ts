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
        return {
          stdout: "com.example.fitness\n",
          stderr: "",
          code: 0,
          signal: null,
          timedOut: false,
        };
      },
    });
    expect(pkg).toBe("com.example.fitness");
  });
});
