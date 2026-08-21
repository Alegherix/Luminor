import type { BrowserFrameEnvelopeHeader } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import {
  decodeBinaryFrameEnvelope,
  decodeLengthPrefixedBinaryFrames,
  encodeBinaryFrameEnvelope,
  encodeLengthPrefixedBinaryFrame,
} from "./frameEnvelope";

const header: BrowserFrameEnvelopeHeader = {
  payloadType: "browser",
  frame: {
    desktopInstanceId:
      "11111111-1111-4111-8111-111111111111" as BrowserFrameEnvelopeHeader["frame"]["desktopInstanceId"],
    threadId: "thread-1" as BrowserFrameEnvelopeHeader["frame"]["threadId"],
    tabId: "22222222-2222-4222-8222-222222222222" as BrowserFrameEnvelopeHeader["frame"]["tabId"],
    generation: 2 as BrowserFrameEnvelopeHeader["frame"]["generation"],
    seq: 8 as BrowserFrameEnvelopeHeader["frame"]["seq"],
    jpegW: 640,
    jpegH: 480,
    deviceWidth: 640,
    deviceHeight: 480,
    pageScaleFactor: 1,
    offsetTop: 0,
    scrollOffsetX: 0,
    scrollOffsetY: 0,
    timestamp: 11,
    captureTs: 12,
  },
};

describe("binary frame envelope", () => {
  it("round-trips browser metadata and JPEG bytes", () => {
    const encoded = encodeBinaryFrameEnvelope({ header, payload: new Uint8Array([1, 2, 3]) });
    const decoded = decodeBinaryFrameEnvelope(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.frame.header).toEqual(header);
    expect([...decoded.frame.payload]).toEqual([1, 2, 3]);
  });

  it("rejects a payload type that disagrees with its binary discriminator", () => {
    const encoded = encodeBinaryFrameEnvelope({ header, payload: new Uint8Array([1]) });
    encoded[5] = 1;
    expect(decodeBinaryFrameEnvelope(encoded)).toEqual({
      ok: false,
      reason: "invalid-payload-type",
    });
  });

  it("retains incomplete bytes between length-prefixed reads", () => {
    const first = encodeLengthPrefixedBinaryFrame(new Uint8Array([1, 2]));
    const second = encodeLengthPrefixedBinaryFrame(new Uint8Array([3, 4, 5]));
    const joined = new Uint8Array(first.byteLength + second.byteLength - 1);
    joined.set(first);
    joined.set(second.subarray(0, -1), first.byteLength);
    const decoded = decodeLengthPrefixedBinaryFrames(joined);
    expect(decoded?.frames.map((value) => [...value])).toEqual([[1, 2]]);
    expect(decoded?.remaining.byteLength).toBe(second.byteLength - 1);
  });
});
