import { describe, expect, it } from "vitest";

import { parseRpcResponseFrame } from "./lib/luminor-ws-rpc-client.ts";

describe("parseRpcResponseFrame", () => {
  it("treats ping frames as keepalive", () => {
    expect(parseRpcResponseFrame(JSON.stringify({ _tag: "Ping" }), "req-1")).toEqual({
      kind: "ping",
    });
  });

  it("ignores ack and unrelated exit frames", () => {
    expect(parseRpcResponseFrame(JSON.stringify({ _tag: "Ack", requestId: "req-1" }), "req-1")).toEqual(
      { kind: "pending" },
    );
    expect(
      parseRpcResponseFrame(
        JSON.stringify({
          _tag: "Exit",
          requestId: "other",
          exit: { _tag: "Success", value: {} },
        }),
        "req-1",
      ),
    ).toEqual({ kind: "pending" });
  });

  it("resolves success and failure exits", () => {
    expect(
      parseRpcResponseFrame(
        JSON.stringify({
          _tag: "Exit",
          requestId: "req-1",
          exit: { _tag: "Success", value: { ok: true } },
        }),
        "req-1",
      ),
    ).toEqual({ kind: "success", value: { ok: true } });

    const failure = parseRpcResponseFrame(
      JSON.stringify({
        _tag: "Exit",
        requestId: "req-1",
        exit: { _tag: "Failure", cause: { message: "nope" } },
      }),
      "req-1",
    );
    expect(failure.kind).toBe("failure");
  });
});
