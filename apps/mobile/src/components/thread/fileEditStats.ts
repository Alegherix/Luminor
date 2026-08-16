import type { OrchestrationCheckpointFile } from "@luminor/contracts";

import { interpolate } from "./format";
import { strings } from "../../strings";

export type Diffstat = {
  readonly additions: number;
  readonly deletions: number;
};

export function sumDiffstat(files: readonly OrchestrationCheckpointFile[]): Diffstat {
  return files.reduce<Diffstat>(
    (acc, file) => ({
      additions: acc.additions + file.additions,
      deletions: acc.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

export function formatSigned(count: number, sign: "+" | "−"): string {
  return `${sign}${count}`;
}

export function editedFilesLabel(count: number): string {
  if (count === 1) return strings.thread.editedFilesOne;
  return interpolate(strings.thread.editedFilesMany, { count });
}
