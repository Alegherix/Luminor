import { describe, expect, it } from "vitest";

import { composeServerdCoreSpec } from "./serverdCoreSpec";

describe("composeServerdCoreSpec", () => {
  it("serializes the exact Electron backend command and required environment passthrough", () => {
    const program = "/opt/electron/electron";
    const args = ["--max-old-space-size=8192", "/opt/luminor/apps/server/dist/index.mjs"];

    expect(JSON.parse(composeServerdCoreSpec({ program, args }))).toEqual({
      program,
      args,
      envPassthrough: [
        "LUMINOR_HOME",
        "LUMINOR_HOST",
        "LUMINOR_MODE",
        "ELECTRON_RUN_AS_NODE",
        "LUMINOR_SERVER_ENTRY",
      ],
    });
  });
});
