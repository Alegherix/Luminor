import * as Crypto from "node:crypto";
import * as FS from "node:fs";
import * as Net from "node:net";
import * as Path from "node:path";

import {
  BROWSER_FRAME_PIPE_PROTOCOL,
  BrowserFramePipeHandshake,
  type BrowserFramePipeHandshakeResult,
} from "@luminor/contracts";
import {
  decodeLengthPrefixedBinaryFrames,
  encodeBinaryFrameEnvelope,
  encodeLengthPrefixedBinaryFrame,
} from "@luminor/shared/frameEnvelope";
import { Schema } from "effect";

import type { BrowserRemoteFrameController } from "./controller";

const MAX_HANDSHAKE_BYTES = 8 * 1024;
const PIPE_DIRECTORY = "luminor-browser-frames";

export const LUMINOR_BROWSER_FRAME_PIPE_ENV = "LUMINOR_BROWSER_FRAME_PIPE_PATH";
export const LUMINOR_BROWSER_FRAME_CAPABILITY_ENV = "LUMINOR_BROWSER_FRAME_CAPABILITY";
export const LUMINOR_BROWSER_FRAME_CAPABILITY_FD_ENV = "LUMINOR_BROWSER_FRAME_CAPABILITY_FD";

interface FramePipeClient {
  readonly socket: Net.Socket;
  pending: Uint8Array;
  authorized: boolean;
  backpressured: boolean;
  latest: Uint8Array | null;
}

export interface BrowserFramePipeServerOptions {
  readonly pipePath?: string;
  readonly capability: string;
  readonly platform?: NodeJS.Platform;
}

export function resolveDefaultBrowserFramePipePath(
  platform = process.platform,
  pid = process.pid,
): string {
  const suffix = `${pid}-${Crypto.randomUUID()}`;
  if (platform === "win32") return `\\\\.\\pipe\\luminor-browser-frames-${suffix}`;
  const uid = process.getuid?.();
  const directory = uid === undefined ? PIPE_DIRECTORY : `${PIPE_DIRECTORY}-${uid}`;
  return Path.join("/tmp", directory, `${suffix}.sock`);
}

export const LUMINOR_BROWSER_FRAME_PIPE_PATH =
  process.env[LUMINOR_BROWSER_FRAME_PIPE_ENV]?.trim() || resolveDefaultBrowserFramePipePath();

export function resolveBrowserFramePipeBackendEnv(
  inheritedEnv: NodeJS.ProcessEnv,
  activePipePath: string | null | undefined,
  capabilityFd?: number | null,
): NodeJS.ProcessEnv {
  const backendEnv = { ...inheritedEnv };
  delete backendEnv[LUMINOR_BROWSER_FRAME_PIPE_ENV];
  delete backendEnv[LUMINOR_BROWSER_FRAME_CAPABILITY_ENV];
  delete backendEnv[LUMINOR_BROWSER_FRAME_CAPABILITY_FD_ENV];
  if (activePipePath?.trim() && Number.isInteger(capabilityFd) && (capabilityFd ?? 0) >= 3) {
    backendEnv[LUMINOR_BROWSER_FRAME_PIPE_ENV] = activePipePath;
    backendEnv[LUMINOR_BROWSER_FRAME_CAPABILITY_FD_ENV] = String(capabilityFd);
  }
  return backendEnv;
}

const prepareUnixPipe = (pipePath: string): void => {
  const parent = Path.dirname(pipePath);
  FS.mkdirSync(parent, { mode: 0o700, recursive: true });
  const parentStat = FS.lstatSync(parent);
  if (
    parentStat.isSymbolicLink() ||
    !parentStat.isDirectory() ||
    (process.getuid && parentStat.uid !== process.getuid()) ||
    (parentStat.mode & 0o077) !== 0
  ) {
    throw new Error("Browser frame pipe directory is not private");
  }
  try {
    const pipeStat = FS.lstatSync(pipePath);
    if (
      pipeStat.isSymbolicLink() ||
      (!pipeStat.isSocket() && !pipeStat.isFile()) ||
      (process.getuid && pipeStat.uid !== process.getuid())
    ) {
      throw new Error("Browser frame pipe path is unsafe");
    }
    FS.unlinkSync(pipePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

const cleanupUnixPipe = (pipePath: string): void => {
  try {
    FS.unlinkSync(pipePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

export class BrowserFramePipeServer {
  private readonly server: Net.Server;
  private readonly clients = new Set<FramePipeClient>();
  private readonly capability: string;
  private readonly pipePath: string;
  private readonly platform: NodeJS.Platform;
  private readonly unsubscribeFrames: () => void;
  private started = false;

  constructor(
    controller: Pick<BrowserRemoteFrameController, "desktopInstanceId" | "subscribeFrames">,
    options: BrowserFramePipeServerOptions,
  ) {
    if (Buffer.byteLength(options.capability.trim(), "utf8") < 32) {
      throw new Error("Browser frame pipe requires a private backend capability");
    }
    this.capability = options.capability.trim();
    this.pipePath = options.pipePath ?? LUMINOR_BROWSER_FRAME_PIPE_PATH;
    this.platform = options.platform ?? process.platform;
    this.server = Net.createServer((socket) => this.accept(socket, controller.desktopInstanceId));
    this.unsubscribeFrames = controller.subscribeFrames((frame) => {
      const encoded = encodeLengthPrefixedBinaryFrame(
        encodeBinaryFrameEnvelope({
          header: { payloadType: "browser", frame: frame.header },
          payload: frame.jpeg,
        }),
      );
      for (const client of this.clients) this.sendFrame(client, encoded);
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.platform !== "win32") prepareUnixPipe(this.pipePath);
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen({ path: this.pipePath, readableAll: false, writableAll: false }, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    if (this.platform !== "win32") FS.chmodSync(this.pipePath, 0o600);
    this.started = true;
  }

  async dispose(): Promise<void> {
    this.unsubscribeFrames();
    for (const client of this.clients) client.socket.destroy();
    this.clients.clear();
    if (this.started) {
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
      this.started = false;
      if (this.platform !== "win32") cleanupUnixPipe(this.pipePath);
    }
  }

  private accept(
    socket: Net.Socket,
    desktopInstanceId: BrowserFramePipeHandshakeResult["desktopInstanceId"],
  ): void {
    const client: FramePipeClient = {
      socket,
      pending: new Uint8Array(),
      authorized: false,
      backpressured: false,
      latest: null,
    };
    this.clients.add(client);
    socket.on("data", (chunk) => this.receive(client, chunk, desktopInstanceId));
    const release = () => this.clients.delete(client);
    socket.on("close", release);
    socket.on("error", release);
  }

  private receive(
    client: FramePipeClient,
    chunk: Buffer,
    desktopInstanceId: BrowserFramePipeHandshakeResult["desktopInstanceId"],
  ): void {
    if (client.authorized) {
      client.socket.destroy();
      return;
    }
    const pending = new Uint8Array(client.pending.byteLength + chunk.byteLength);
    pending.set(client.pending);
    pending.set(chunk, client.pending.byteLength);
    const decoded = decodeLengthPrefixedBinaryFrames(pending);
    if (
      !decoded ||
      decoded.remaining.byteLength > MAX_HANDSHAKE_BYTES ||
      decoded.frames.length > 1
    ) {
      client.socket.destroy();
      return;
    }
    client.pending = decoded.remaining;
    const frame = decoded.frames[0];
    if (!frame) return;
    let handshake: unknown;
    try {
      handshake = JSON.parse(new TextDecoder().decode(frame));
    } catch {
      client.socket.destroy();
      return;
    }
    if (!Schema.is(BrowserFramePipeHandshake)(handshake)) {
      client.socket.destroy();
      return;
    }
    const expected = Buffer.from(this.capability, "utf8");
    const supplied = Buffer.from(handshake.capability, "utf8");
    const accepted =
      supplied.byteLength === expected.byteLength && Crypto.timingSafeEqual(supplied, expected);
    const response: BrowserFramePipeHandshakeResult = {
      accepted,
      desktopInstanceId: accepted ? desktopInstanceId : null,
    };
    client.socket.write(
      encodeLengthPrefixedBinaryFrame(new TextEncoder().encode(JSON.stringify(response))),
    );
    if (!accepted || client.pending.byteLength > 0) {
      client.socket.end();
      return;
    }
    client.authorized = true;
  }

  private sendFrame(client: FramePipeClient, frame: Uint8Array): void {
    if (!client.authorized || client.socket.destroyed || client.socket.writableEnded) return;
    if (client.backpressured) {
      client.latest = frame;
      return;
    }
    if (client.socket.write(frame)) return;
    client.backpressured = true;
    client.socket.once("drain", () => {
      client.backpressured = false;
      const latest = client.latest;
      client.latest = null;
      if (latest) this.sendFrame(client, latest);
    });
  }
}
