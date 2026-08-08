import { describe, expect, it } from "vitest";

import {
  resolveLuminorDesktopFlavor,
  LUMINOR_CANARY_BUNDLE_ID,
  LUMINOR_CANARY_DESKTOP_ENTRY_URL,
  LUMINOR_CANARY_DESKTOP_ORIGIN,
  LUMINOR_DESKTOP_ENTRY_URL,
  LUMINOR_DESKTOP_ORIGIN,
  LUMINOR_DESKTOP_UPDATE_CHANNEL,
  LUMINOR_DEVELOPMENT_BUNDLE_ID,
  LUMINOR_PRODUCTION_BUNDLE_ID,
  luminorBundleId,
  luminorDesktopIdentity,
} from "./desktopIdentity";

describe("desktopIdentity", () => {
  it("uses the exact canonical production and development bundle IDs", () => {
    expect(LUMINOR_PRODUCTION_BUNDLE_ID).toBe("com.emanueledipietro.luminor");
    expect(LUMINOR_DEVELOPMENT_BUNDLE_ID).toBe("com.emanueledipietro.luminor.dev");
    expect(luminorBundleId(false)).toBe(LUMINOR_PRODUCTION_BUNDLE_ID);
    expect(luminorBundleId(true)).toBe(LUMINOR_DEVELOPMENT_BUNDLE_ID);
  });

  it("uses the exact packaged renderer origin and entry URL", () => {
    expect(LUMINOR_DESKTOP_ORIGIN).toBe("luminor://app");
    expect(LUMINOR_DESKTOP_ENTRY_URL).toBe("luminor://app/index.html");
  });

  it("uses the isolated Luminor desktop update channel", () => {
    expect(LUMINOR_DESKTOP_UPDATE_CHANNEL).toBe("luminor");
  });

  it("gives Canary a fully separate desktop identity and storage profile", () => {
    expect(LUMINOR_CANARY_BUNDLE_ID).toBe("com.emanueledipietro.luminor.canary");
    expect(LUMINOR_CANARY_DESKTOP_ORIGIN).toBe("luminor-canary://app");
    expect(LUMINOR_CANARY_DESKTOP_ENTRY_URL).toBe("luminor-canary://app/index.html");
    expect(luminorDesktopIdentity("canary")).toEqual({
      flavor: "canary",
      displayName: "Luminor Canary",
      bundleId: LUMINOR_CANARY_BUNDLE_ID,
      scheme: "luminor-canary",
      origin: LUMINOR_CANARY_DESKTOP_ORIGIN,
      entryUrl: LUMINOR_CANARY_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "luminor-canary",
      defaultHomeDirectoryName: ".luminor-canary",
      usesScriptedUpdates: true,
    });
  });

  it("selects Canary explicitly without changing normal dev and production defaults", () => {
    expect(resolveLuminorDesktopFlavor({ isDevelopment: false })).toBe("production");
    expect(resolveLuminorDesktopFlavor({ isDevelopment: true })).toBe("development");
    expect(resolveLuminorDesktopFlavor({ isDevelopment: false, requestedFlavor: " canary " })).toBe(
      "canary",
    );
    expect(resolveLuminorDesktopFlavor({ isDevelopment: true, requestedFlavor: "canary" })).toBe(
      "canary",
    );
  });
});
