import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { connect, type Socket } from "node:net";

import type { runProcess } from "../../processRunner.ts";
import { DeviceBackendError, type DeviceFrameListener } from "../DeviceBackend.ts";
import {
  AnnexBSplitter,
  NAL_TYPE_IDR,
  NAL_TYPE_PPS,
  NAL_TYPE_SEI,
  NAL_TYPE_SLICE,
  NAL_TYPE_SPS,
  nalUnitType,
} from "./annexB.ts";

export interface ScrcpyStreamOptions {
  readonly adbPath: string;
  readonly serial: string;
  readonly serverJarPath: string;
  readonly serverVersion: string;
  readonly maxFps?: number;
  readonly onFrame: DeviceFrameListener;
  readonly run: typeof runProcess;
}

const DEVICE_JAR_PATH = "/data/local/tmp/luminor-scrcpy-server.jar";
const CONNECT_ATTEMPTS = 50;
const CONNECT_RETRY_MS = 100;
const SCRCPY_SCID_SPACE = 0x80000000;

export function createScrcpyScid(random: () => number = Math.random): string {
  return Math.floor(random() * SCRCPY_SCID_SPACE)
    .toString(16)
    .padStart(8, "0");
}

export interface ScrcpySocketConnectionOptions {
  readonly attempts?: number;
  readonly retryMs?: number;
  readonly connectSocket?: () => Socket;
}

export function connectScrcpySocketWithRetry(
  port: number,
  options: ScrcpySocketConnectionOptions = {},
): Promise<Socket> {
  const attempts = options.attempts ?? CONNECT_ATTEMPTS;
  const retryMs = options.retryMs ?? CONNECT_RETRY_MS;
  const connectSocket = options.connectSocket ?? (() => connect({ host: "127.0.0.1", port }));

  return new Promise((resolve, reject) => {
    let attempt = 0;
    let settled = false;
    const tryConnect = (): void => {
      attempt += 1;
      const socket = connectSocket();
      let attemptFinished = false;

      const cleanup = (): void => {
        socket.off("readable", onReadable);
        socket.off("error", retry);
        socket.off("close", retry);
      };
      const retry = (): void => {
        if (attemptFinished || settled) return;
        attemptFinished = true;
        cleanup();
        socket.destroy();
        if (attempt >= attempts) {
          settled = true;
          reject(
            new DeviceBackendError("Could not connect to the scrcpy video socket.", {
              retryable: true,
            }),
          );
          return;
        }
        setTimeout(tryConnect, retryMs);
      };
      const onReadable = (): void => {
        if (attemptFinished || settled) return;
        if (socket.readableLength === 0) return;
        attemptFinished = true;
        settled = true;
        cleanup();
        socket.on("error", () => socket.destroy());
        resolve(socket);
      };

      socket.once("readable", onReadable);
      socket.once("error", retry);
      socket.once("close", retry);
    };
    tryConnect();
  });
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export class ScrcpyStream {
  private constructor(
    private readonly options: ScrcpyStreamOptions,
    private readonly serverProcess: ChildProcess,
    private readonly socket: Socket,
    private readonly localPort: number,
  ) {}

  static async start(options: ScrcpyStreamOptions): Promise<ScrcpyStream> {
    await options.run(options.adbPath, [
      "-s",
      options.serial,
      "push",
      options.serverJarPath,
      DEVICE_JAR_PATH,
    ]);
    const scid = createScrcpyScid();
    const forwardOut = await options.run(options.adbPath, [
      "-s",
      options.serial,
      "forward",
      "tcp:0",
      `localabstract:scrcpy_${scid}`,
    ]);
    const localPort = Number.parseInt(forwardOut.stdout.trim(), 10);
    if (!Number.isFinite(localPort) || localPort <= 0) {
      throw new DeviceBackendError(
        `adb forward did not return a port: ${forwardOut.stdout.trim()}`,
      );
    }

    // scrcpy protocol invariant: raw_stream=true skips the handshake bytes and
    // device metadata entirely; the socket carries a bare Annex B H.264 stream.
    const serverProcess = spawn(
      options.adbPath,
      [
        "-s",
        options.serial,
        "shell",
        `CLASSPATH=${DEVICE_JAR_PATH}`,
        "app_process",
        "/",
        "com.genymobile.scrcpy.Server",
        options.serverVersion,
        `scid=${scid}`,
        "log_level=warn",
        "video=true",
        "audio=false",
        "control=false",
        "video_codec=h264",
        "raw_stream=true",
        "tunnel_forward=true",
        `max_fps=${options.maxFps ?? 60}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );

    const startupOutput: string[] = [];
    const collectStartupOutput = (chunk: Buffer): void => {
      if (startupOutput.join("").length < 8_192) startupOutput.push(chunk.toString());
    };
    serverProcess.stdout?.on("data", collectStartupOutput);
    serverProcess.stderr?.on("data", collectStartupOutput);
    let removeExitListeners = (): void => {};
    const exited = new Promise<never>((_resolve, reject) => {
      const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
        const detail = startupOutput.join("").trim();
        reject(
          new DeviceBackendError(
            `scrcpy server exited before streaming (${code === null ? signal : `code ${code}`})${detail ? `: ${detail}` : ""}`,
          ),
        );
      };
      const onError = (cause: Error): void => {
        reject(new DeviceBackendError(`Could not start the scrcpy server: ${cause.message}`));
      };
      serverProcess.once("exit", onExit);
      serverProcess.once("error", onError);
      removeExitListeners = () => {
        serverProcess.off("exit", onExit);
        serverProcess.off("error", onError);
      };
    });

    let socket: Socket;
    try {
      socket = await Promise.race([connectScrcpySocketWithRetry(localPort), exited]);
    } catch (cause) {
      removeExitListeners();
      serverProcess.kill("SIGKILL");
      await options
        .run(options.adbPath, ["-s", options.serial, "forward", "--remove", `tcp:${localPort}`])
        .catch(() => {});
      throw cause;
    }
    removeExitListeners();
    serverProcess.stdout?.off("data", collectStartupOutput);
    serverProcess.stderr?.off("data", collectStartupOutput);
    serverProcess.stdout?.resume();
    serverProcess.stderr?.resume();
    const stream = new ScrcpyStream(options, serverProcess, socket, localPort);
    stream.pump();
    return stream;
  }

  private pump(): void {
    const splitter = new AnnexBSplitter();
    let sequence = 0;
    let pendingConfig: Uint8Array[] = [];
    let pendingSei: Uint8Array[] = [];

    this.socket.on("data", (chunk: Buffer) => {
      for (const nal of splitter.push(new Uint8Array(chunk))) {
        const type = nalUnitType(nal);
        if (type === NAL_TYPE_SPS || type === NAL_TYPE_PPS) {
          pendingConfig.push(nal);
          if (type === NAL_TYPE_PPS && pendingConfig.length >= 2) {
            sequence += 1;
            this.options.onFrame({
              sequence,
              timestampMs: Date.now(),
              keyframe: false,
              codecConfig: true,
              data: concat(pendingConfig),
            });
            pendingConfig = [];
          }
          continue;
        }
        if (type === NAL_TYPE_SEI) {
          pendingSei.push(nal);
          continue;
        }
        if (type === NAL_TYPE_IDR || type === NAL_TYPE_SLICE) {
          sequence += 1;
          this.options.onFrame({
            sequence,
            timestampMs: Date.now(),
            keyframe: type === NAL_TYPE_IDR,
            codecConfig: false,
            data: pendingSei.length > 0 ? concat([...pendingSei, nal]) : nal,
          });
          pendingSei = [];
        }
      }
    });
  }

  async stop(): Promise<void> {
    this.socket.destroy();
    this.serverProcess.kill("SIGKILL");
    await this.options
      .run(this.options.adbPath, [
        "-s",
        this.options.serial,
        "forward",
        "--remove",
        `tcp:${this.localPort}`,
      ])
      .catch(() => {});
  }
}
