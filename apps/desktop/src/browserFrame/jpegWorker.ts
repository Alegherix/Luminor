import { parentPort } from "node:worker_threads";

import sharp from "sharp";

interface JpegEncodeRequest {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly bitmap: ArrayBuffer;
}

interface JpegEncodeSuccess {
  readonly id: number;
  readonly ok: true;
  readonly jpeg: ArrayBuffer;
}

interface JpegEncodeFailure {
  readonly id: number;
  readonly ok: false;
  readonly error: string;
}

parentPort?.on("message", async (request: JpegEncodeRequest) => {
  try {
    const bitmap = Buffer.from(request.bitmap);
    const jpeg = await sharp(bitmap, {
      raw: { width: request.width, height: request.height, channels: 4 },
    })
      .removeAlpha()
      .recomb([
        [0, 0, 1],
        [0, 1, 0],
        [1, 0, 0],
      ])
      .jpeg({ quality: 78, chromaSubsampling: "4:2:0" })
      .toBuffer();
    const transferable = new Uint8Array(jpeg.byteLength);
    transferable.set(jpeg);
    const bytes = transferable.buffer;
    const result: JpegEncodeSuccess = { id: request.id, ok: true, jpeg: bytes };
    parentPort?.postMessage(result, [bytes]);
  } catch (error) {
    const result: JpegEncodeFailure = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    parentPort?.postMessage(result);
  }
});
