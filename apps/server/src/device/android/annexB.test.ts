import { describe, expect, it } from "vitest";

import { AnnexBSplitter, buildAvcCDescription, nalUnitType } from "./annexB";

const nal = (type: number, ...body: number[]) => new Uint8Array([0, 0, 0, 1, type, ...body]);
const shortNal = (type: number, ...body: number[]) => new Uint8Array([0, 0, 1, type, ...body]);

describe("AnnexBSplitter", () => {
  it("splits across chunk boundaries and identifies NAL types", () => {
    const splitter = new AnnexBSplitter();
    const stream = new Uint8Array([
      ...nal(0x67, 1, 2),
      ...shortNal(0x68, 3),
      ...nal(0x65, 4, 5, 6),
      ...shortNal(0x41, 7),
    ]);
    const nals = [
      ...splitter.push(stream.subarray(0, 5)),
      ...splitter.push(stream.subarray(5, 13)),
      ...splitter.push(stream.subarray(13)),
      ...splitter.flush(),
    ];
    expect(nals.map((unit) => nalUnitType(unit))).toEqual([7, 8, 5, 1]);
  });
});

describe("buildAvcCDescription", () => {
  it("wraps sps/pps in an avcC box", () => {
    const sps = new Uint8Array([0x67, 0x64, 0x00, 0x28, 0xac]);
    const pps = new Uint8Array([0x68, 0xee, 0x38, 0x80]);
    const avcc = buildAvcCDescription(sps, pps);
    expect(avcc[0]).toBe(1);
    expect([avcc[1], avcc[2], avcc[3]]).toEqual([0x64, 0x00, 0x28]);
    expect(avcc[4]).toBe(0xff);
  });
});
