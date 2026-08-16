import { describe, expect, it } from "vitest";

import {
  decodeFrame,
  encodeAck,
  encodeInterrupt,
  encodePong,
  encodeRequest,
  extractRpcFailure,
} from "./frames";

describe("Effect-RPC JSON frames", () => {
  it("encodes a Request with id, tag, payload, and empty headers", () => {
    expect(JSON.parse(encodeRequest("1", "orchestration.getShellSnapshot", {}))).toEqual({
      _tag: "Request",
      id: "1",
      tag: "orchestration.getShellSnapshot",
      payload: {},
      headers: [],
    });
  });

  it("decodes Exit success, Exit failure, and Chunk frames", () => {
    expect(
      decodeFrame(
        JSON.stringify({
          _tag: "Exit",
          requestId: "1",
          exit: { _tag: "Success", value: { snapshotSequence: 4 } },
        }),
      ),
    ).toEqual({
      _tag: "Exit",
      requestId: "1",
      exit: { _tag: "Success", value: { snapshotSequence: 4 } },
    });

    expect(
      decodeFrame(
        JSON.stringify({
          _tag: "Exit",
          requestId: "2",
          exit: {
            _tag: "Failure",
            cause: { _tag: "Fail", error: { message: "nope", code: "WS_RPC" } },
          },
        }),
      ),
    ).toEqual({
      _tag: "Exit",
      requestId: "2",
      exit: {
        _tag: "Failure",
        cause: { _tag: "Fail", error: { message: "nope", code: "WS_RPC" } },
      },
    });

    expect(
      decodeFrame(
        JSON.stringify({
          _tag: "Chunk",
          requestId: "stream-1",
          values: [{ kind: "snapshot" }],
        }),
      ),
    ).toEqual({
      _tag: "Chunk",
      requestId: "stream-1",
      values: [{ kind: "snapshot" }],
    });
  });

  it("decodes Ping/Pong/Interrupt/Ack/Eof and encodes replies", () => {
    expect(decodeFrame(JSON.stringify({ _tag: "Ping" }))).toEqual({ _tag: "Ping" });
    expect(JSON.parse(encodePong())).toEqual({ _tag: "Pong" });
    expect(JSON.parse(encodeInterrupt("req-9"))).toEqual({
      _tag: "Interrupt",
      requestId: "req-9",
    });
    expect(JSON.parse(encodeAck("stream-1"))).toEqual({ _tag: "Ack", requestId: "stream-1" });
    expect(decodeFrame(JSON.stringify({ _tag: "Eof", requestId: "stream-1" }))).toEqual({
      _tag: "Eof",
      requestId: "stream-1",
    });
  });

  it("returns null for malformed JSON and unknown tags", () => {
    expect(decodeFrame("{")).toBeNull();
    expect(decodeFrame(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(decodeFrame(JSON.stringify({ _tag: "Exit", requestId: 1 }))).toBeNull();
  });

  it("extracts a typed failure message from a nested Effect cause", () => {
    expect(
      extractRpcFailure({
        _tag: "Fail",
        error: {
          _tag: "WsRpcError",
          message: "THREAD_SNAPSHOT_NOT_FOUND",
          code: "THREAD_SNAPSHOT_NOT_FOUND",
        },
      }),
    ).toEqual({
      message: "THREAD_SNAPSHOT_NOT_FOUND",
      code: "THREAD_SNAPSHOT_NOT_FOUND",
    });
  });
});
