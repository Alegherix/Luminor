import { describe, expect, it } from "vitest";

import {
  DESKTOP_ALLOW_INSECURE_REMOTE_ENV,
  withDesktopRemoteAccessEnv,
} from "./backendRemoteAccess";

describe("desktop remote access env", () => {
  it("opts the child backend into plaintext Tailscale remote bind", () => {
    expect(DESKTOP_ALLOW_INSECURE_REMOTE_ENV.LUMINOR_ALLOW_INSECURE_REMOTE).toBe("1");
    expect(
      withDesktopRemoteAccessEnv({
        LUMINOR_HOST: "127.0.0.1",
        LUMINOR_ALLOW_INSECURE_REMOTE: "0",
      }),
    ).toMatchObject({
      LUMINOR_HOST: "127.0.0.1",
      LUMINOR_ALLOW_INSECURE_REMOTE: "1",
    });
  });
});
