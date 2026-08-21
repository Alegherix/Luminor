import { assert, describe, it } from "@effect/vitest";

import {
  createDesktopPlatformBuildConfig,
  DESKTOP_NATIVE_ASAR_UNPACK_GLOBS,
  MAC_DEVICE_HELPER_RESOURCE_PATH,
  MAC_DEVICE_HELPER_STAGE_PATH,
  MAC_ENTITLEMENTS_PATH,
  MAC_INHERITED_ENTITLEMENTS_PATH,
  MICROPHONE_USAGE_DESCRIPTION,
  NODE_PTY_ASAR_UNPACK_GLOBS,
  THIRD_PARTY_NOTICES_PATH,
  validateDesktopNativeBuildHost,
  WINDOWS_INSTALLER_GUID,
} from "./lib/desktop-platform-build-config.ts";
import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";

describe("createDesktopPlatformBuildConfig", () => {
  it("adds explicit microphone entitlements to macOS builds", () => {
    const config = createDesktopPlatformBuildConfig({
      platform: "mac",
      target: "dmg",
      signed: true,
    });
    const mac = config.mac as Record<string, unknown>;
    const dmg = config.dmg as Record<string, unknown>;
    const extendInfo = mac.extendInfo as Record<string, unknown>;

    assert.deepStrictEqual(mac.target, ["dmg", "zip"]);
    assert.equal(mac.icon, "icon.icns");
    assert.deepStrictEqual(config.asarUnpack, [...DESKTOP_NATIVE_ASAR_UNPACK_GLOBS]);
    assert.equal(mac.hardenedRuntime, true);
    assert.equal(mac.notarize, true);
    assert.equal(dmg.sign, true);
    assert.equal(dmg.writeUpdateInfo, false);
    assert.equal(mac.entitlements, MAC_ENTITLEMENTS_PATH);
    assert.equal(mac.entitlementsInherit, MAC_INHERITED_ENTITLEMENTS_PATH);
    assert.equal(mac.binaries, undefined);
    assert.equal(mac.x64ArchFiles, undefined);
    assert.equal(config.files, undefined);
    assert.deepStrictEqual(config.extraFiles, [
      {
        from: THIRD_PARTY_NOTICES_PATH,
        to: THIRD_PARTY_NOTICES_PATH,
      },
      {
        from: MAC_DEVICE_HELPER_STAGE_PATH,
        to: MAC_DEVICE_HELPER_RESOURCE_PATH,
      },
    ]);
    assert.equal(extendInfo.NSMicrophoneUsageDescription, MICROPHONE_USAGE_DESCRIPTION);
    assert.equal(extendInfo.NSScreenCaptureUsageDescription, undefined);
  });

  it("leaves the DMG container unsigned for build-only macOS artifacts", () => {
    const config = createDesktopPlatformBuildConfig({
      platform: "mac",
      target: "dmg",
      signed: false,
    });

    assert.deepStrictEqual(config.dmg, { sign: false, writeUpdateInfo: false });
  });

  it("leaves non-macOS platform configs unchanged", () => {
    const linux = createDesktopPlatformBuildConfig({
      platform: "linux",
      target: "AppImage",
    });
    const win = createDesktopPlatformBuildConfig({
      platform: "win",
      target: "nsis",
      windowsAzureSignOptions: { publisherName: "Luminor" },
    });

    assert.equal(linux.mac, undefined);
    assert.deepStrictEqual(linux.extraFiles, [
      { from: THIRD_PARTY_NOTICES_PATH, to: THIRD_PARTY_NOTICES_PATH },
    ]);
    assert.deepStrictEqual(linux.asarUnpack, [...DESKTOP_NATIVE_ASAR_UNPACK_GLOBS]);
    assert.deepStrictEqual(linux.linux, {
      target: ["AppImage"],
      executableName: "luminor",
      icon: "icon.png",
      category: "Development",
      desktop: {
        entry: {
          StartupWMClass: "luminor",
        },
      },
    });

    assert.equal(win.mac, undefined);
    assert.deepStrictEqual(win.extraFiles, [
      { from: THIRD_PARTY_NOTICES_PATH, to: THIRD_PARTY_NOTICES_PATH },
    ]);
    assert.deepStrictEqual(win.asarUnpack, [...DESKTOP_NATIVE_ASAR_UNPACK_GLOBS]);
    assert.equal(WINDOWS_INSTALLER_GUID, "368107a8-afe6-5db5-ab3b-d4f331684868");
    assert.deepStrictEqual(win.nsis, {
      guid: WINDOWS_INSTALLER_GUID,
    });
    assert.deepStrictEqual(win.win, {
      target: ["nsis"],
      icon: "icon.ico",
      publisherName: "Luminor",
      azureSignOptions: { publisherName: "Luminor" },
    });
  });

  it("omits Azure signing options for unsigned build-only artifacts", () => {
    const config = createDesktopPlatformBuildConfig({
      platform: "win",
      target: "nsis",
    });

    assert.deepStrictEqual(config.win, {
      target: ["nsis"],
      icon: "icon.ico",
    });
  });

  it("keeps native dependencies unpacked from ASAR in generated build config", () => {
    const config = createDesktopPlatformBuildConfig({
      platform: "linux",
      target: "AppImage",
    });

    assert.deepStrictEqual([...NODE_PTY_ASAR_UNPACK_GLOBS], ["node_modules/node-pty/**"]);
    assert.deepStrictEqual(config.asarUnpack, [...DESKTOP_NATIVE_ASAR_UNPACK_GLOBS]);
  });

  it("blocks unsupported or non-matching Linux native build hosts", () => {
    assert.equal(
      validateDesktopNativeBuildHost({
        platform: "linux",
        arch: "x64",
        hostPlatform: "linux",
        hostArch: "x64",
      }),
      null,
    );

    assert.equal(
      validateDesktopNativeBuildHost({
        platform: "linux",
        arch: "universal",
        hostPlatform: "linux",
        hostArch: "x64",
      }),
      "Linux desktop artifacts support x64 or arm64 builds, not universal builds.",
    );

    const issue = validateDesktopNativeBuildHost({
      platform: "linux",
      arch: "x64",
      hostPlatform: "darwin",
      hostArch: "arm64",
    });

    assert.ok(issue?.includes("Build linux/x64 on a matching Linux host"));
  });

  it("does not impose a native-helper host restriction on macOS targets", () => {
    assert.equal(
      validateDesktopNativeBuildHost({
        platform: "mac",
        arch: "universal",
        hostPlatform: "darwin",
        hostArch: "arm64",
      }),
      null,
    );

    assert.equal(
      validateDesktopNativeBuildHost({
        platform: "mac",
        arch: "arm64",
        hostPlatform: "linux",
        hostArch: "arm64",
      }),
      null,
    );
  });

  it("keeps separate macOS sources for solid and rounded icons", () => {
    assert.equal(BRAND_ASSET_PATHS.productionMacIconPng, "assets/prod/black-macos-1024.png");
    assert.equal(
      BRAND_ASSET_PATHS.productionMacLegacyIconPng,
      "assets/prod/black-macos-legacy-1024.png",
    );
  });
});
