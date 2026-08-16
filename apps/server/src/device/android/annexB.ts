const START_CODE = new Uint8Array([0, 0, 0, 1]);

export function nalUnitType(nal: Uint8Array): number {
  const offset = nal[2] === 1 ? 3 : 4;
  return (nal[offset] ?? 0) & 0x1f;
}

export class AnnexBSplitter {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): readonly Uint8Array[] {
    const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.byteLength);

    const starts: number[] = [];
    for (let index = 0; index + 3 <= merged.byteLength; index += 1) {
      if (merged[index] !== 0 || merged[index + 1] !== 0) continue;
      if (merged[index + 2] === 1) {
        starts.push(index);
        index += 2;
      } else if (merged[index + 2] === 0 && merged[index + 3] === 1) {
        starts.push(index);
        index += 3;
      }
    }

    if (starts.length <= 1) {
      this.buffer = merged;
      return [];
    }
    const units: Uint8Array[] = [];
    for (let unit = 0; unit < starts.length - 1; unit += 1) {
      units.push(merged.slice(starts[unit], starts[unit + 1]));
    }
    this.buffer = merged.slice(starts.at(-1) ?? 0);
    return units;
  }

  flush(): readonly Uint8Array[] {
    const rest = this.buffer;
    this.buffer = new Uint8Array(0);
    return rest.byteLength > 4 ? [rest] : [];
  }
}

function stripStartCode(nal: Uint8Array): Uint8Array {
  return nal.subarray(nal[2] === 1 ? 3 : 4);
}

export function avccFromAnnexB(nal: Uint8Array): Uint8Array {
  const body = stripStartCode(nal);
  const out = new Uint8Array(4 + body.byteLength);
  new DataView(out.buffer).setUint32(0, body.byteLength, false);
  out.set(body, 4);
  return out;
}

export function buildAvcCDescription(
  spsWithHeader: Uint8Array,
  ppsWithHeader: Uint8Array,
): Uint8Array {
  const sps =
    spsWithHeader[2] === 1 || spsWithHeader[3] === 1
      ? stripStartCode(spsWithHeader)
      : spsWithHeader;
  const pps =
    ppsWithHeader[2] === 1 || ppsWithHeader[3] === 1
      ? stripStartCode(ppsWithHeader)
      : ppsWithHeader;
  const out = new Uint8Array(11 + sps.byteLength + pps.byteLength);
  const view = new DataView(out.buffer);
  out[0] = 1;
  out[1] = sps[1] ?? 0;
  out[2] = sps[2] ?? 0;
  out[3] = sps[3] ?? 0;
  out[4] = 0xff;
  out[5] = 0xe1;
  view.setUint16(6, sps.byteLength, false);
  out.set(sps, 8);
  out[8 + sps.byteLength] = 1;
  view.setUint16(9 + sps.byteLength, pps.byteLength, false);
  out.set(pps, 11 + sps.byteLength);
  return out;
}

export const NAL_TYPE_IDR = 5;
export const NAL_TYPE_SEI = 6;
export const NAL_TYPE_SPS = 7;
export const NAL_TYPE_PPS = 8;
export const NAL_TYPE_SLICE = 1;

export { START_CODE };
