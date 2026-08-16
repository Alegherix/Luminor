import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import * as path from "node:path";

export async function selectRecordingDirectory(
  candidates: readonly string[],
  fallback: string,
): Promise<string> {
  for (const directory of candidates) {
    const usable = await stat(directory).then(
      async (info) => {
        if (!info.isDirectory()) return false;
        return await access(directory, fsConstants.W_OK).then(
          () => true,
          () => false,
        );
      },
      () => false,
    );
    if (usable) return directory;
  }
  return fallback;
}

export async function resolveDeviceRecordingDirectory(
  override: string | undefined,
): Promise<string> {
  if (override) return path.resolve(override);
  return await selectRecordingDirectory(
    [path.join(homedir(), "Desktop"), path.join(homedir(), "Downloads")],
    tmpdir(),
  );
}
