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
