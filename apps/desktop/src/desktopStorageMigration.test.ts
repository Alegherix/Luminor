import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import { describe, expect, it } from "vitest";

import {
  acknowledgeLuminorStorageSnapshot,
  readLuminorStorageSnapshot,
  saveLuminorStorageSnapshot,
  LUMINOR_STORAGE_SNAPSHOT_MAX_BYTES,
  validateLuminorStorageSnapshot,
} from "./desktopStorageMigration";

const snapshot = (exportedAt = "2026-07-09T00:00:00.000Z") => ({
  version: 1 as const,
  exportedAt,
  entries: {
    "luminor:theme": "dark",
    "luminor.openUsage.enabled": "true",
  },
});

describe("desktopStorageMigration", () => {
  it("round-trips atomically and acknowledges the snapshot", async () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "luminor-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      await expect(saveLuminorStorageSnapshot(target, snapshot())).resolves.toBe(true);
      expect(readLuminorStorageSnapshot(target)).toEqual(snapshot());
      expect(FS.readdirSync(directory)).toEqual(["snapshot.json"]);

      await acknowledgeLuminorStorageSnapshot(target);
      expect(readLuminorStorageSnapshot(target)).toBeNull();
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed, disallowed, and oversized snapshots", () => {
    expect(validateLuminorStorageSnapshot({ version: 1 })).toBeNull();
    expect(
      validateLuminorStorageSnapshot({
        ...snapshot(),
        entries: { "foreign:theme": "dark" },
      }),
    ).toBeNull();
    expect(
      validateLuminorStorageSnapshot({
        ...snapshot(),
        entries: { "luminor:large": "x".repeat(LUMINOR_STORAGE_SNAPSHOT_MAX_BYTES) },
      }),
    ).toBeNull();
  });

  it("accepts renderer snapshots containing large composer drafts", () => {
    const largeDraft = "x".repeat(2 * 1024 * 1024);

    expect(
      validateLuminorStorageSnapshot({
        ...snapshot(),
        entries: { "luminor:composer-drafts:v1": largeDraft },
      })?.entries["luminor:composer-drafts:v1"],
    ).toBe(largeDraft);
  });

  it("does not replace a newer snapshot with an older export", async () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "luminor-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      await saveLuminorStorageSnapshot(target, snapshot("2026-07-09T01:00:00.000Z"));
      await expect(
        saveLuminorStorageSnapshot(target, snapshot("2026-07-09T00:00:00.000Z")),
      ).resolves.toBe(false);
      expect(readLuminorStorageSnapshot(target)?.exportedAt).toBe("2026-07-09T01:00:00.000Z");
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("treats missing and malformed files as absent", () => {
    const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), "luminor-storage-migration-"));
    const target = Path.join(directory, "snapshot.json");
    try {
      expect(readLuminorStorageSnapshot(target)).toBeNull();
      FS.writeFileSync(target, "not json");
      expect(readLuminorStorageSnapshot(target)).toBeNull();
    } finally {
      FS.rmSync(directory, { recursive: true, force: true });
    }
  });
});
