// FILE: desktopIdentity.ts
// Purpose: Defines the canonical desktop application identity across packaging and runtime.

export const LUMINOR_DESKTOP_SCHEME = "luminor";
export const LUMINOR_DESKTOP_ORIGIN = `${LUMINOR_DESKTOP_SCHEME}://app`;
export const LUMINOR_DESKTOP_ENTRY_URL = `${LUMINOR_DESKTOP_ORIGIN}/index.html`;
export const LUMINOR_DESKTOP_UPDATE_CHANNEL = "luminor";
export const LUMINOR_PRODUCTION_BUNDLE_ID = "com.emanueledipietro.luminor";
export const LUMINOR_DEVELOPMENT_BUNDLE_ID = `${LUMINOR_PRODUCTION_BUNDLE_ID}.dev`;
export const LUMINOR_CANARY_BUNDLE_ID = `${LUMINOR_PRODUCTION_BUNDLE_ID}.canary`;
export const LUMINOR_CANARY_DESKTOP_SCHEME = "luminor-canary";
export const LUMINOR_CANARY_DESKTOP_ORIGIN = `${LUMINOR_CANARY_DESKTOP_SCHEME}://app`;
export const LUMINOR_CANARY_DESKTOP_ENTRY_URL = `${LUMINOR_CANARY_DESKTOP_ORIGIN}/index.html`;

export type LuminorDesktopFlavor = "production" | "development" | "canary";

export interface LuminorDesktopIdentity {
  readonly flavor: LuminorDesktopFlavor;
  readonly displayName: string;
  readonly bundleId: string;
  readonly scheme: string;
  readonly origin: string;
  readonly entryUrl: string;
  readonly userDataDirectoryName: string;
  readonly defaultHomeDirectoryName: string;
  readonly usesScriptedUpdates: boolean;
}

export function resolveLuminorDesktopFlavor(input: {
  readonly isDevelopment: boolean;
  readonly requestedFlavor?: string | undefined;
}): LuminorDesktopFlavor {
  if (input.requestedFlavor?.trim().toLowerCase() === "canary") {
    return "canary";
  }
  return input.isDevelopment ? "development" : "production";
}

export function luminorDesktopIdentity(flavor: LuminorDesktopFlavor): LuminorDesktopIdentity {
  if (flavor === "canary") {
    return {
      flavor,
      displayName: "Luminor Canary",
      bundleId: LUMINOR_CANARY_BUNDLE_ID,
      scheme: LUMINOR_CANARY_DESKTOP_SCHEME,
      origin: LUMINOR_CANARY_DESKTOP_ORIGIN,
      entryUrl: LUMINOR_CANARY_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "luminor-canary",
      defaultHomeDirectoryName: ".luminor-canary",
      usesScriptedUpdates: true,
    };
  }
  if (flavor === "development") {
    return {
      flavor,
      displayName: "Luminor (Dev)",
      bundleId: LUMINOR_DEVELOPMENT_BUNDLE_ID,
      scheme: LUMINOR_DESKTOP_SCHEME,
      origin: LUMINOR_DESKTOP_ORIGIN,
      entryUrl: LUMINOR_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "luminor-dev",
      defaultHomeDirectoryName: ".luminor",
      usesScriptedUpdates: false,
    };
  }
  return {
    flavor,
    displayName: "Luminor",
    bundleId: LUMINOR_PRODUCTION_BUNDLE_ID,
    scheme: LUMINOR_DESKTOP_SCHEME,
    origin: LUMINOR_DESKTOP_ORIGIN,
    entryUrl: LUMINOR_DESKTOP_ENTRY_URL,
    userDataDirectoryName: "luminor",
    defaultHomeDirectoryName: ".luminor",
    usesScriptedUpdates: false,
  };
}

export function luminorBundleId(isDevelopment: boolean): string {
  return luminorDesktopIdentity(isDevelopment ? "development" : "production").bundleId;
}
