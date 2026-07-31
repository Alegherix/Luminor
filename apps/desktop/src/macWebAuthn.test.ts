import { describe, expect, it, vi } from "vitest";

import { configureMacWebAuthn } from "./macWebAuthn";

describe("configureMacWebAuthn", () => {
  it("configures the Touch ID authenticator with the embedded access group", () => {
    const configureWebAuthn = vi.fn();
    const result = configureMacWebAuthn({
      platform: "darwin",
      envAccessGroup: undefined,
      embeddedAccessGroup: "ABCDE12345.com.emanueledipietro.synara.webauthn",
      configureWebAuthn,
    });

    expect(result).toEqual({
      state: "configured",
      keychainAccessGroup: "ABCDE12345.com.emanueledipietro.synara.webauthn",
    });
    expect(configureWebAuthn).toHaveBeenCalledExactlyOnceWith({
      touchID: { keychainAccessGroup: "ABCDE12345.com.emanueledipietro.synara.webauthn" },
    });
  });

  it("prefers the env override and trims whitespace", () => {
    const configureWebAuthn = vi.fn();
    const result = configureMacWebAuthn({
      platform: "darwin",
      envAccessGroup: "  DEV1234567.com.emanueledipietro.synara.dev.webauthn  ",
      embeddedAccessGroup: "ABCDE12345.com.emanueledipietro.synara.webauthn",
      configureWebAuthn,
    });

    expect(result).toMatchObject({
      state: "configured",
      keychainAccessGroup: "DEV1234567.com.emanueledipietro.synara.dev.webauthn",
    });
  });

  it("skips on non-macOS platforms without touching the API", () => {
    const configureWebAuthn = vi.fn();
    for (const platform of ["win32", "linux"] as const) {
      expect(
        configureMacWebAuthn({
          platform,
          envAccessGroup: "ABCDE12345.example.webauthn",
          embeddedAccessGroup: "ABCDE12345.example.webauthn",
          configureWebAuthn,
        }),
      ).toEqual({ state: "skipped", reason: "unsupported-platform" });
    }
    expect(configureWebAuthn).not.toHaveBeenCalled();
  });

  it("skips when no usable access group exists (unsigned builds)", () => {
    const configureWebAuthn = vi.fn();
    for (const embedded of [undefined, null, "", "   ", 42, { group: "x" }]) {
      expect(
        configureMacWebAuthn({
          platform: "darwin",
          envAccessGroup: undefined,
          embeddedAccessGroup: embedded,
          configureWebAuthn,
        }),
      ).toEqual({ state: "skipped", reason: "no-access-group" });
    }
    expect(configureWebAuthn).not.toHaveBeenCalled();
  });

  it("reports failure instead of throwing when the Electron API rejects the group", () => {
    const failure = new Error("keychain access group not present in entitlements");
    const result = configureMacWebAuthn({
      platform: "darwin",
      envAccessGroup: undefined,
      embeddedAccessGroup: "ABCDE12345.com.emanueledipietro.synara.webauthn",
      configureWebAuthn: () => {
        throw failure;
      },
    });

    expect(result).toEqual({
      state: "failed",
      keychainAccessGroup: "ABCDE12345.com.emanueledipietro.synara.webauthn",
      cause: failure,
    });
  });
});
