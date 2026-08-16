import { describe, expect, it } from "vitest";
import { pngDimensions } from "./pngDimensions";

describe("pngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(bytes.buffer).setUint32(16, 1080, false);
    new DataView(bytes.buffer).setUint32(20, 2340, false);
    expect(pngDimensions(bytes)).toEqual({ width: 1080, height: 2340 });
  });
});
