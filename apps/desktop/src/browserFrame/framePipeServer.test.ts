import * as FS from "node:fs/promises";
import * as Net from "node:net";
import * as Path from "node:path";

import type { BrowserDesktopInstanceId, BrowserFrameHeader } from "@luminor/contracts";
import {
  decodeBinaryFrameEnvelope,
  decodeLengthPrefixedBinaryFrames,
  encodeLengthPrefixedBinaryFrame,
} from "@luminor/shared/frameEnvelope";
import { describe, expect, it } from "vitest";

import type { AcquiredBrowserFrame } from "./acquisition";
import { BrowserFramePipeServer } from "./framePipeServer";

const capability = "browser-frame-pipe-test-capability-0123456789";
const desktopInstanceId = "11111111-1111-4111-8111-111111111111" as BrowserDesktopInstanceId;

const createReader = (socket: Net.Socket) => {
  let pending: Uint8Array<ArrayBufferLike> = new Uint8Array();
  const frames: Uint8Array[] = [];
  const waiters: Array<(value: Uint8Array) => void> = [];
  socket.on("data", (chunk) => {
    const combined = new Uint8Array(pending.byteLength + chunk.byteLength);
    combined.set(pending);
    combined.set(chunk, pending.byteLength);
    const decoded = decodeLengthPrefixedBinaryFrames(combined);
    if (!decoded) return;
    pending = decoded.remaining;
    for (const frame of decoded.frames) {
      const waiter = waiters.shift();
      if (waiter) waiter(frame);
      else frames.push(frame);
    }
  });
  return () => {
    const frame = frames.shift();
    return frame
      ? Promise.resolve(frame)
      : new Promise<Uint8Array>((resolve) => waiters.push(resolve));
  };
};

describe("BrowserFramePipeServer", () => {
  it("authenticates its one-way pipe and forwards length-prefixed browser envelopes", async () => {
    const privateDirectory =
      process.platform === "win32"
        ? null
        : await FS.mkdtemp(Path.join("/tmp", `luminor-frame-${process.pid}-`));
    const pipePath =
      process.platform === "win32"
        ? String.raw`\\.\pipe\luminor-frame-${process.pid}-${crypto.randomUUID()}`
        : Path.join(privateDirectory!, `${crypto.randomUUID()}.sock`);
    let frameListener: ((frame: AcquiredBrowserFrame) => void) | null = null;
    const server = new BrowserFramePipeServer(
      {
        desktopInstanceId,
        subscribeFrames: (listener) => {
          frameListener = listener;
          return () => {
            frameListener = null;
          };
        },
      },
      { pipePath, capability },
    );
    await server.start();
    const socket = Net.createConnection(pipePath);
    const readFrame = createReader(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.write(
      encodeLengthPrefixedBinaryFrame(
        new TextEncoder().encode(
          JSON.stringify({ protocol: "luminor-browser-frame-v1", capability }),
        ),
      ),
    );
    expect(JSON.parse(new TextDecoder().decode(await readFrame()))).toEqual({
      accepted: true,
      desktopInstanceId,
    });
    const header: BrowserFrameHeader = {
      desktopInstanceId,
      threadId: "thread-1" as BrowserFrameHeader["threadId"],
      tabId: "22222222-2222-4222-8222-222222222222" as BrowserFrameHeader["tabId"],
      generation: 1 as BrowserFrameHeader["generation"],
      seq: 0 as BrowserFrameHeader["seq"],
      jpegW: 2,
      jpegH: 2,
      deviceWidth: 2,
      deviceHeight: 2,
      pageScaleFactor: 1,
      offsetTop: 0,
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      timestamp: 1,
      captureTs: 2,
    };
    expect(frameListener).not.toBeNull();
    (frameListener as unknown as (frame: AcquiredBrowserFrame) => void)({
      header,
      jpeg: new Uint8Array([1, 2, 3]),
    });
    const decoded = decodeBinaryFrameEnvelope(await readFrame());
    expect(decoded.ok && decoded.frame.header).toEqual({ payloadType: "browser", frame: header });
    socket.destroy();
    await server.dispose();
    if (privateDirectory) await FS.rm(privateDirectory, { recursive: true, force: true });
  });
});
