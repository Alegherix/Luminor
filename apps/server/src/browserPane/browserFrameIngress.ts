import * as FS from "node:fs";
import * as Net from "node:net";

import {
  BROWSER_FRAME_PIPE_PROTOCOL,
  BrowserFramePipeHandshakeResult,
  type BrowserDesktopInstanceId,
} from "@luminor/contracts";
import {
  decodeBinaryFrameEnvelope,
  decodeLengthPrefixedBinaryFrames,
  encodeLengthPrefixedBinaryFrame,
} from "@luminor/shared/frameEnvelope";
import { Schema } from "effect";

export interface BrowserFrameIngressOptions {
  readonly pipePath: string;
  readonly capability: string;
  readonly onDesktop: (desktopInstanceId: BrowserDesktopInstanceId) => void;
  readonly onFrame: (
    frame: ReturnType<typeof decodeBinaryFrameEnvelope>,
    encoded: Uint8Array,
  ) => void;
  readonly onDisconnect: () => void;
}

export class BrowserFrameIngress {
  private socket: Net.Socket | null = null;
  private pending: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private authorized = false;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BrowserFrameIngressOptions) {}

  async start(): Promise<void> {
    if (this.socket) return;
    this.stopped = false;
    const socket = Net.createConnection(this.options.pipePath);
    this.socket = socket;
    socket.on("data", (chunk) => this.receive(chunk));
    socket.on("close", this.disconnect);
    socket.on("error", this.disconnect);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Browser frame pipe connection timed out")),
        5_000,
      );
      socket.once("connect", () => {
        clearTimeout(timer);
        socket.write(
          encodeLengthPrefixedBinaryFrame(
            new TextEncoder().encode(
              JSON.stringify({
                protocol: BROWSER_FRAME_PIPE_PROTOCOL,
                capability: this.options.capability,
              }),
            ),
          ),
        );
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.destroy();
    this.disconnect();
  }

  private receive(chunk: Buffer): void {
    const combined = new Uint8Array(this.pending.byteLength + chunk.byteLength);
    combined.set(this.pending);
    combined.set(chunk, this.pending.byteLength);
    const decoded = decodeLengthPrefixedBinaryFrames(combined);
    if (!decoded) {
      this.socket?.destroy();
      return;
    }
    this.pending = decoded.remaining;
    for (const bytes of decoded.frames) {
      if (!this.authorized) {
        this.acceptHandshake(bytes);
        continue;
      }
      this.options.onFrame(decodeBinaryFrameEnvelope(bytes), bytes);
    }
  }

  private acceptHandshake(bytes: Uint8Array): void {
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      this.socket?.destroy();
      return;
    }
    if (
      !Schema.is(BrowserFramePipeHandshakeResult)(value) ||
      !value.accepted ||
      !value.desktopInstanceId
    ) {
      this.socket?.destroy();
      return;
    }
    this.authorized = true;
    this.options.onDesktop(value.desktopInstanceId);
  }

  private readonly disconnect = (): void => {
    if (!this.socket) return;
    this.socket = null;
    this.pending = new Uint8Array();
    this.authorized = false;
    this.options.onDisconnect();
    if (!this.stopped && !this.retryTimer) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.start().catch(() => undefined);
      }, 250);
      this.retryTimer.unref();
    }
  };
}

let frameCapabilityFromFd: string | null | undefined;

export function resolveBrowserFramePipePath(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.LUMINOR_BROWSER_FRAME_PIPE_PATH?.trim() || null;
}

export function resolveBrowserFrameCapability(env: NodeJS.ProcessEnv = process.env): string | null {
  const direct = env.LUMINOR_BROWSER_FRAME_CAPABILITY?.trim();
  if (direct && Buffer.byteLength(direct, "utf8") >= 32) return direct;
  const rawFd = env.LUMINOR_BROWSER_FRAME_CAPABILITY_FD?.trim();
  if (!rawFd || !/^\d+$/.test(rawFd)) return null;
  const fd = Number(rawFd);
  if (!Number.isSafeInteger(fd) || fd < 3 || fd > 255) return null;
  if (frameCapabilityFromFd !== undefined) return frameCapabilityFromFd;
  try {
    const value = FS.readFileSync(fd, "utf8").trim();
    frameCapabilityFromFd = Buffer.byteLength(value, "utf8") >= 32 ? value : null;
  } catch {
    frameCapabilityFromFd = null;
  }
  return frameCapabilityFromFd;
}
