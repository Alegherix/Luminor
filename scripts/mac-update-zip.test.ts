// FILE: mac-update-zip.test.ts
// Purpose: Locks down macOS update zip validation and latest-mac.yml patching.
// Layer: Release/build tests
// Depends on: scripts/lib/mac-update-zip.ts.

import { assert, describe, it } from "@effect/vitest";

import {
  assertMacUpdateManifestZipMetadata,
  buildMacUpdateZipSymlinkEntries,
  isZipInfoSymlink,
  resolveMacUpdateManifestFileNames,
  resolveSingleMacUpdateZipFileName,
  resolveSingleTopLevelMacAppBundle,
  updateMacUpdateManifestZipEntry,
  validateMacUpdateManifestZipMetadata,
} from "./lib/mac-update-zip.ts";

describe("mac-update-zip", () => {
  it("detects symlink entries from unzip verbose metadata", () => {
    assert.equal(
      isZipInfoSymlink(
        `  Unix file attributes (120755 octal):            lrwxr-xr-x
  MS-DOS file attributes (00 hex):                none
`,
      ),
      true,
    );
    assert.equal(
      isZipInfoSymlink(
        `  Unix file attributes (100755 octal):            -rwxr-xr-x
  MS-DOS file attributes (00 hex):                none
`,
      ),
      false,
    );
  });

  it("builds Electron framework symlink paths for the top-level app bundle", () => {
    assert.deepStrictEqual(buildMacUpdateZipSymlinkEntries("Luminor.app"), [
      "Luminor.app/Contents/Frameworks/Electron Framework.framework/Electron Framework",
      "Luminor.app/Contents/Frameworks/Electron Framework.framework/Helpers",
      "Luminor.app/Contents/Frameworks/Electron Framework.framework/Libraries",
      "Luminor.app/Contents/Frameworks/Electron Framework.framework/Resources",
      "Luminor.app/Contents/Frameworks/Electron Framework.framework/Versions/Current",
    ]);
  });

  it("resolves exactly one top-level .app from update zip entries", () => {
    assert.equal(
      resolveSingleTopLevelMacAppBundle([
        "__MACOSX/Luminor.app/Contents/Info.plist",
        "Luminor.app/Contents/Info.plist",
        "Luminor.app/Contents/MacOS/Luminor",
      ]),
      "Luminor.app",
    );

    assert.throws(
      () =>
        resolveSingleTopLevelMacAppBundle([
          "Luminor.app/Contents/Info.plist",
          "Other.app/Contents/Info.plist",
        ]),
      /Expected one top-level \.app bundle/,
    );
  });

  it("resolves exactly one macOS update zip artifact", () => {
    assert.equal(
      resolveSingleMacUpdateZipFileName([
        "Luminor-0.1.5-arm64.dmg",
        "Luminor-0.1.5-arm64.zip",
        "latest-mac.yml",
      ]),
      "Luminor-0.1.5-arm64.zip",
    );

    assert.throws(
      () => resolveSingleMacUpdateZipFileName(["Luminor-0.1.5-arm64.zip", "Luminor-0.1.5-x64.zip"]),
      /Expected one macOS update zip artifact/,
    );
  });

  it("requires at least one macOS update manifest", () => {
    assert.deepStrictEqual(
      resolveMacUpdateManifestFileNames([
        "Luminor-0.1.5-arm64.dmg",
        "Luminor-0.1.5-arm64.zip",
        "latest-mac.yml",
      ]),
      ["latest-mac.yml"],
    );

    assert.throws(
      () => resolveMacUpdateManifestFileNames(["Luminor-0.1.5-arm64.dmg"]),
      /Expected at least one macOS update manifest/,
    );
  });

  it("updates the macOS zip file entry and matching top-level sha", () => {
    const manifest = `version: 0.1.4
files:
  - url: Luminor-0.1.4-arm64.zip
    sha512: oldzip
    size: 100
  - url: Luminor-0.1.4-arm64.dmg
    sha512: olddmg
    size: 200
path: 'Luminor-0.1.4-arm64.zip'
sha512: oldzip
releaseDate: '2026-06-07T12:00:00.000Z'
`;

    const updated = updateMacUpdateManifestZipEntry(manifest, "Luminor-0.1.4-arm64.zip", {
      sha512: "newzip",
      size: 12345,
    });

    assert.equal(
      updated,
      `version: 0.1.4
files:
  - url: Luminor-0.1.4-arm64.zip
    sha512: newzip
    size: 12345
  - url: Luminor-0.1.4-arm64.dmg
    sha512: olddmg
    size: 200
path: 'Luminor-0.1.4-arm64.zip'
sha512: newzip
releaseDate: '2026-06-07T12:00:00.000Z'
`,
    );
  });

  it("drops the stale blockMapSize from the repacked zip entry but keeps the dmg blockMapSize", () => {
    const manifest = `version: 0.1.4
files:
  - url: Luminor-0.1.4-arm64.zip
    sha512: oldzip
    size: 100
    blockMapSize: 50
  - url: Luminor-0.1.4-arm64.dmg
    sha512: olddmg
    size: 200
    blockMapSize: 75
path: 'Luminor-0.1.4-arm64.zip'
sha512: oldzip
releaseDate: '2026-06-07T12:00:00.000Z'
`;

    const updated = updateMacUpdateManifestZipEntry(manifest, "Luminor-0.1.4-arm64.zip", {
      sha512: "newzip",
      size: 12345,
    });

    assert.equal(
      updated,
      `version: 0.1.4
files:
  - url: Luminor-0.1.4-arm64.zip
    sha512: newzip
    size: 12345
  - url: Luminor-0.1.4-arm64.dmg
    sha512: olddmg
    size: 200
    blockMapSize: 75
path: 'Luminor-0.1.4-arm64.zip'
sha512: newzip
releaseDate: '2026-06-07T12:00:00.000Z'
`,
    );
  });

  it("rejects manifests missing the target zip entry", () => {
    assert.throws(
      () =>
        updateMacUpdateManifestZipEntry(
          `version: 0.1.4
files:
  - url: Luminor-0.1.4-arm64.dmg
    sha512: olddmg
    size: 200
releaseDate: '2026-06-07T12:00:00.000Z'
`,
          "Luminor-0.1.4-arm64.zip",
          {
            sha512: "newzip",
            size: 12345,
          },
        ),
      /Could not update Luminor-0.1.4-arm64.zip entry/,
    );
  });

  it("validates manifest metadata after zip repack", () => {
    const manifest = `version: 0.1.5
files:
  - url: Luminor-0.1.5-arm64.zip
    sha512: newzip
    size: 12345
path: Luminor-0.1.5-arm64.zip
sha512: newzip
releaseDate: '2026-06-07T12:00:00.000Z'
`;
    const metadata = { sha512: "newzip", size: 12345 };

    assert.deepStrictEqual(
      validateMacUpdateManifestZipMetadata(manifest, "Luminor-0.1.5-arm64.zip", metadata),
      {
        manifestHasZipPath: true,
        manifestHasZipSha: true,
        manifestHasZipSize: true,
      },
    );
    assert.deepStrictEqual(
      assertMacUpdateManifestZipMetadata(manifest, "Luminor-0.1.5-arm64.zip", metadata),
      {
        manifestHasZipPath: true,
        manifestHasZipSha: true,
        manifestHasZipSize: true,
      },
    );
  });
});
