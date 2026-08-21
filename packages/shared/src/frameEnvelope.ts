import {
  BINARY_FRAME_ENVELOPE_FIXED_BYTES,
  BINARY_FRAME_ENVELOPE_MAGIC,
  BINARY_FRAME_ENVELOPE_MAX_HEADER_BYTES,
  BINARY_FRAME_ENVELOPE_MAX_PAYLOAD_BYTES,
  BINARY_FRAME_ENVELOPE_VERSION,
  BinaryFrameEnvelopeHeader,
  type BinaryFrameEnvelopeDecodeErrorReason,
} from "@luminor/contracts";
import { Schema } from "effect";

export interface BinaryFrameEnvelope {
  readonly header: BinaryFrameEnvelopeHeader;
  readonly payload: Uint8Array;
}

export type BinaryFrameEnvelopeDecodeResult =
  | { readonly ok: true; readonly frame: BinaryFrameEnvelope; readonly byteLength: number }
  | { readonly ok: false; readonly reason: BinaryFrameEnvelopeDecodeErrorReason };

export class BinaryFrameEnvelopeEncodeError extends Error {}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const payloadTypeCode = (payloadType: BinaryFrameEnvelopeHeader["payloadType"]): number =>
  payloadType === "device" ? 1 : 2;

const payloadTypeForCode = (code: number): BinaryFrameEnvelopeHeader["payloadType"] | null =>
  code === 1 ? "device" : code === 2 ? "browser" : null;

export function encodeBinaryFrameEnvelope(frame: BinaryFrameEnvelope): Uint8Array {
  if (!Schema.is(BinaryFrameEnvelopeHeader)(frame.header)) {
    throw new BinaryFrameEnvelopeEncodeError("Invalid binary frame header");
  }
  const headerBytes = textEncoder.encode(JSON.stringify(frame.header));
  if (
    headerBytes.byteLength === 0 ||
    headerBytes.byteLength > BINARY_FRAME_ENVELOPE_MAX_HEADER_BYTES
  ) {
    throw new BinaryFrameEnvelopeEncodeError("Binary frame header exceeds its size limit");
  }
  if (frame.payload.byteLength > BINARY_FRAME_ENVELOPE_MAX_PAYLOAD_BYTES) {
    throw new BinaryFrameEnvelopeEncodeError("Binary frame payload exceeds its size limit");
  }
  const output = new Uint8Array(
    BINARY_FRAME_ENVELOPE_FIXED_BYTES + headerBytes.byteLength + frame.payload.byteLength,
  );
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  view.setUint32(0, BINARY_FRAME_ENVELOPE_MAGIC, true);
  view.setUint8(4, BINARY_FRAME_ENVELOPE_VERSION);
  view.setUint8(5, payloadTypeCode(frame.header.payloadType));
  view.setUint32(6, headerBytes.byteLength, true);
  view.setUint32(10, frame.payload.byteLength, true);
  output.set(headerBytes, BINARY_FRAME_ENVELOPE_FIXED_BYTES);
  output.set(frame.payload, BINARY_FRAME_ENVELOPE_FIXED_BYTES + headerBytes.byteLength);
  return output;
}

export function decodeBinaryFrameEnvelope(bytes: Uint8Array): BinaryFrameEnvelopeDecodeResult {
  if (bytes.byteLength < BINARY_FRAME_ENVELOPE_FIXED_BYTES) {
    return { ok: false, reason: "truncated-header" };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== BINARY_FRAME_ENVELOPE_MAGIC) {
    return { ok: false, reason: "bad-magic" };
  }
  if (view.getUint8(4) !== BINARY_FRAME_ENVELOPE_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  const payloadType = payloadTypeForCode(view.getUint8(5));
  if (!payloadType) return { ok: false, reason: "invalid-payload-type" };
  const headerLength = view.getUint32(6, true);
  if (headerLength === 0 || headerLength > BINARY_FRAME_ENVELOPE_MAX_HEADER_BYTES) {
    return { ok: false, reason: "invalid-header-length" };
  }
  const payloadLength = view.getUint32(10, true);
  if (payloadLength > BINARY_FRAME_ENVELOPE_MAX_PAYLOAD_BYTES) {
    return { ok: false, reason: "invalid-payload-length" };
  }
  const totalLength = BINARY_FRAME_ENVELOPE_FIXED_BYTES + headerLength + payloadLength;
  if (bytes.byteLength < totalLength) return { ok: false, reason: "truncated-frame" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      textDecoder.decode(
        bytes.subarray(
          BINARY_FRAME_ENVELOPE_FIXED_BYTES,
          BINARY_FRAME_ENVELOPE_FIXED_BYTES + headerLength,
        ),
      ),
    );
  } catch {
    return { ok: false, reason: "invalid-header-json" };
  }
  if (!Schema.is(BinaryFrameEnvelopeHeader)(parsed)) {
    return { ok: false, reason: "invalid-header-schema" };
  }
  if (parsed.payloadType !== payloadType) {
    return { ok: false, reason: "invalid-payload-type" };
  }
  return {
    ok: true,
    frame: {
      header: parsed,
      payload: bytes.subarray(BINARY_FRAME_ENVELOPE_FIXED_BYTES + headerLength, totalLength),
    },
    byteLength: totalLength,
  };
}

export function encodeLengthPrefixedBinaryFrame(frame: Uint8Array): Uint8Array {
  const output = new Uint8Array(4 + frame.byteLength);
  new DataView(output.buffer).setUint32(0, frame.byteLength, true);
  output.set(frame, 4);
  return output;
}

export function decodeLengthPrefixedBinaryFrames(bytes: Uint8Array): {
  readonly frames: readonly Uint8Array[];
  readonly remaining: Uint8Array;
} | null {
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (bytes.byteLength - offset >= 4) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
    if (
      length === 0 ||
      length > BINARY_FRAME_ENVELOPE_MAX_HEADER_BYTES + BINARY_FRAME_ENVELOPE_MAX_PAYLOAD_BYTES
    ) {
      return null;
    }
    if (bytes.byteLength - offset - 4 < length) break;
    frames.push(bytes.slice(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  return { frames, remaining: bytes.slice(offset) };
}
