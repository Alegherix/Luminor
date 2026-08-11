import { describe, expect, it } from "vitest";

import {
  collectErrorMessages,
  CONNECTION_INTERRUPTED_USER_MESSAGE,
  describeErrorMessage,
  describeUserFacingError,
  isEffectFiberInterruptError,
} from "./errorMessages";

describe("errorMessages", () => {
  it("uses Error messages", () => {
    expect(describeErrorMessage(new Error("native binding missing"), "fallback")).toBe(
      "native binding missing",
    );
  });

  it("uses serialized RPC error messages", () => {
    expect(
      describeErrorMessage(
        { _tag: "WsRpcError", message: "Project directory does not exist" },
        "fallback",
      ),
    ).toBe("Project directory does not exist");
  });

  it("includes nested causes without duplicating messages", () => {
    expect(
      describeErrorMessage(
        {
          message: "Failed to load node-pty native module",
          cause: { message: "Cannot find module 'pty.node'" },
        },
        "fallback",
      ),
    ).toBe("Failed to load node-pty native module: Cannot find module 'pty.node'");
  });

  it("avoids cycles in cause chains", () => {
    const error: { message: string; cause?: unknown } = { message: "outer" };
    error.cause = error;

    expect(collectErrorMessages(error)).toEqual(["outer"]);
  });

  it("falls back when no useful message is present", () => {
    expect(describeErrorMessage({ ok: false }, "Failed to open terminal")).toBe(
      "Failed to open terminal",
    );
  });

  it("detects Effect fiber-interrupt errors", () => {
    expect(isEffectFiberInterruptError(new Error("All fibers interrupted without error"))).toBe(
      true,
    );
    const named = new Error("All fibers interrupted without error");
    named.name = "InterruptError";
    expect(isEffectFiberInterruptError(named)).toBe(true);
    expect(
      isEffectFiberInterruptError({ message: "All fibers interrupted without error" }),
    ).toBe(true);
    expect(isEffectFiberInterruptError(new Error("actual provider failure"))).toBe(false);
  });

  it("never surfaces Effect fiber-interrupt internals to the user", () => {
    expect(
      describeUserFacingError(new Error("All fibers interrupted without error"), "Failed to send"),
    ).toBe(CONNECTION_INTERRUPTED_USER_MESSAGE);
    expect(describeUserFacingError(new Error("provider rejected the prompt"), "Failed to send")).toBe(
      "provider rejected the prompt",
    );
    expect(describeUserFacingError({ _tag: "WsRpcError", message: "nope" }, "Failed to send")).toBe(
      "nope",
    );
  });
});
