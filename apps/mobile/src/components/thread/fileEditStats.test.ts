import { describe, expect, it } from "vitest";

import { editedFilesLabel, fileBasename, sumDiffstat } from "./fileEditStats";

describe("sumDiffstat", () => {
  it("totals additions and deletions", () => {
    expect(
      sumDiffstat([
        { path: "a.ts", kind: "modified", additions: 7, deletions: 1 },
        { path: "b.ts", kind: "added", additions: 106, deletions: 87 },
      ]),
    ).toEqual({ additions: 113, deletions: 88 });
  });
});

describe("editedFilesLabel", () => {
  it("pluralizes", () => {
    expect(editedFilesLabel(1)).toBe("Edited 1 file");
    expect(editedFilesLabel(3)).toBe("Edited 3 files");
  });
});

describe("fileBasename", () => {
  it("returns the last path segment", () => {
    expect(fileBasename("apps/mobile/src/foo.ts")).toBe("foo.ts");
  });
});
