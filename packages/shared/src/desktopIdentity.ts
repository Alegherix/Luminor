// FILE: desktopIdentity.ts
// Purpose: Defines the canonical desktop application identity across packaging and runtime.

export const SYNARA_DESKTOP_SCHEME = "synara";
export const SYNARA_DESKTOP_ORIGIN = `${SYNARA_DESKTOP_SCHEME}://app`;
export const SYNARA_DESKTOP_ENTRY_URL = `${SYNARA_DESKTOP_ORIGIN}/index.html`;
export const SYNARA_DESKTOP_UPDATE_CHANNEL = "synara";
export const SYNARA_PRODUCTION_BUNDLE_ID = "com.emanueledipietro.synara";
export const SYNARA_DEVELOPMENT_BUNDLE_ID = `${SYNARA_PRODUCTION_BUNDLE_ID}.dev`;
export const SYNARA_CANARY_BUNDLE_ID = `${SYNARA_PRODUCTION_BUNDLE_ID}.canary`;
export const SYNARA_CANARY_DESKTOP_SCHEME = "synara-canary";
export const SYNARA_CANARY_DESKTOP_ORIGIN = `${SYNARA_CANARY_DESKTOP_SCHEME}://app`;
export const SYNARA_CANARY_DESKTOP_ENTRY_URL = `${SYNARA_CANARY_DESKTOP_ORIGIN}/index.html`;

export type SynaraDesktopFlavor = "production" | "development" | "canary";

export interface SynaraDesktopIdentity {
  readonly flavor: SynaraDesktopFlavor;
  readonly displayName: string;
  readonly bundleId: string;
  readonly scheme: string;
  readonly origin: string;
  readonly entryUrl: string;
  readonly userDataDirectoryName: string;
  readonly defaultHomeDirectoryName: string;
  readonly usesScriptedUpdates: boolean;
}

export function resolveSynaraDesktopFlavor(input: {
  readonly isDevelopment: boolean;
  readonly requestedFlavor?: string | undefined;
}): SynaraDesktopFlavor {
  if (input.requestedFlavor?.trim().toLowerCase() === "canary") {
    return "canary";
  }
  return input.isDevelopment ? "development" : "production";
}

export function synaraDesktopIdentity(flavor: SynaraDesktopFlavor): SynaraDesktopIdentity {
  if (flavor === "canary") {
    return {
      flavor,
      displayName: "Synara Canary",
      bundleId: SYNARA_CANARY_BUNDLE_ID,
      scheme: SYNARA_CANARY_DESKTOP_SCHEME,
      origin: SYNARA_CANARY_DESKTOP_ORIGIN,
      entryUrl: SYNARA_CANARY_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "synara-canary",
      defaultHomeDirectoryName: ".synara-canary",
      usesScriptedUpdates: true,
    };
  }
  if (flavor === "development") {
    return {
      flavor,
      displayName: "Synara (Dev)",
      bundleId: SYNARA_DEVELOPMENT_BUNDLE_ID,
      scheme: SYNARA_DESKTOP_SCHEME,
      origin: SYNARA_DESKTOP_ORIGIN,
      entryUrl: SYNARA_DESKTOP_ENTRY_URL,
      userDataDirectoryName: "synara-dev",
      defaultHomeDirectoryName: ".synara",
      usesScriptedUpdates: false,
    };
  }
  return {
    flavor,
    displayName: "Synara",
    bundleId: SYNARA_PRODUCTION_BUNDLE_ID,
    scheme: SYNARA_DESKTOP_SCHEME,
    origin: SYNARA_DESKTOP_ORIGIN,
    entryUrl: SYNARA_DESKTOP_ENTRY_URL,
    userDataDirectoryName: "synara",
    defaultHomeDirectoryName: ".synara",
    usesScriptedUpdates: false,
  };
}

export function synaraBundleId(isDevelopment: boolean): string {
  return synaraDesktopIdentity(isDevelopment ? "development" : "production").bundleId;
}

// Keychain access group components end up verbatim inside a code-signing
// entitlements plist, so anything outside Apple identifier characters is a
// build-input error rather than something to escape.
const KEYCHAIN_ACCESS_GROUP_COMPONENT_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;

/**
 * Keychain access group that stores WebAuthn (passkey) credentials created by
 * Electron's Touch ID platform authenticator. The same value must be passed to
 * `app.configureWebAuthn` at runtime and listed in the app's
 * `keychain-access-groups` code-signing entitlement.
 */
export function synaraMacWebAuthnKeychainAccessGroup(
  appleTeamId: string,
  bundleId: string,
): string {
  for (const [label, value] of [
    ["Apple team ID", appleTeamId],
    ["bundle ID", bundleId],
  ] as const) {
    if (!KEYCHAIN_ACCESS_GROUP_COMPONENT_PATTERN.test(value)) {
      throw new Error(
        `Invalid ${label} '${value}' for a WebAuthn keychain access group; expected alphanumeric characters, dots, and hyphens.`,
      );
    }
  }
  return `${appleTeamId}.${bundleId}.webauthn`;
}
