export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 24) throw new Error("Not a PNG: too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x89504e47) throw new Error("Not a PNG: bad signature");
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}
