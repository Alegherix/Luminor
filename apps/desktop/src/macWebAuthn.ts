// Enables Electron's WebAuthn Touch ID platform authenticator on macOS. Until
// `app.configureWebAuthn` runs, Chromium never services passkey requests, so
// pages like accounts.google.com wait forever on "Verifying it's you". The
// keychain access group is baked into signed builds (entitlements + staged
// package.json) by scripts/build-desktop-artifact.ts; unsigned dev builds have
// no usable group and skip configuration unless one is provided via env.
//
// Two hard platform limits bound what this can ever deliver:
//   1. keychain-access-groups is a restricted entitlement. macOS SIGKILLs any
//      app claiming it without an embedded provisioning profile that authorizes
//      it, so the build only embeds it alongside SYNARA_MAC_PROVISION_PROFILE.
//   2. This authenticator stores its OWN device-bound credentials in that
//      group. It cannot read passkeys from iCloud Keychain, and it has no
//      cross-device QR flow. Serving passkeys for arbitrary relying parties
//      (google.com and friends) needs Apple's browser-only entitlement
//      com.apple.developer.web-browser.public-key-credential, which is granted
//      by application to shipping web browsers. So a passkey created on a phone
//      can never be used here; only one enrolled inside Synara itself can.

/** Env override for local/dev runs signed with a custom access group. */
export const MAC_WEBAUTHN_ACCESS_GROUP_ENV = "SYNARA_MAC_WEBAUTHN_KEYCHAIN_ACCESS_GROUP";

/** Field written into the packaged app's package.json by the build script. */
export const MAC_WEBAUTHN_ACCESS_GROUP_PACKAGE_FIELD = "synaraMacWebAuthnKeychainAccessGroup";

export interface ConfigureMacWebAuthnInput {
  readonly platform: NodeJS.Platform;
  /** Raw value of the env override; wins over the embedded group when set. */
  readonly envAccessGroup: string | undefined;
  /** Raw package.json field value from the packaged build, if any. */
  readonly embeddedAccessGroup: unknown;
  readonly configureWebAuthn: (options: {
    readonly touchID: { readonly keychainAccessGroup: string };
  }) => void;
}

export type MacWebAuthnConfigurationResult =
  | { readonly state: "configured"; readonly keychainAccessGroup: string }
  | { readonly state: "skipped"; readonly reason: "unsupported-platform" | "no-access-group" }
  | { readonly state: "failed"; readonly keychainAccessGroup: string; readonly cause: unknown };

const normalizeAccessGroup = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function configureMacWebAuthn(
  input: ConfigureMacWebAuthnInput,
): MacWebAuthnConfigurationResult {
  if (input.platform !== "darwin") {
    return { state: "skipped", reason: "unsupported-platform" };
  }
  const keychainAccessGroup =
    normalizeAccessGroup(input.envAccessGroup) ?? normalizeAccessGroup(input.embeddedAccessGroup);
  if (keychainAccessGroup === null) {
    return { state: "skipped", reason: "no-access-group" };
  }
  try {
    input.configureWebAuthn({ touchID: { keychainAccessGroup } });
    return { state: "configured", keychainAccessGroup };
  } catch (cause) {
    return { state: "failed", keychainAccessGroup, cause };
  }
}
