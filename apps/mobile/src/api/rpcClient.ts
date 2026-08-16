import { abortReason } from "./abort";
import {
  decodeFrame,
  encodeAck,
  encodeInterrupt,
  encodePong,
  encodeRequest,
  extractRpcFailure,
} from "./frames";

type SocketMessageEvent = {
  readonly data?: unknown;
};

const REQUEST_TIMEOUT_MS = 60_000;

type PendingUnary = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
};

type PendingStream = {
  readonly onItem: (value: unknown) => void;
  readonly onError: (error: unknown) => void;
  readonly onClose: () => void;
};

export class FeatureRpcClient {
  private nextId = 1;
  private readonly pending = new Map<string, PendingUnary>();
  private readonly streams = new Map<string, PendingStream>();
  private closed = false;

  constructor(private readonly socket: WebSocket) {
    this.socket.addEventListener("message", this.onMessage);
    this.socket.addEventListener("close", this.onSocketClosed);
    this.socket.addEventListener("error", this.onSocketClosed);
  }

  get isOpen(): boolean {
    return !this.closed && this.socket.readyState === 1;
  }

  async request<T>(
    tag: string,
    payload: unknown,
    decode: (value: unknown) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const id = this.nextRequestId();
    const value = await new Promise<unknown>((resolve, reject) => {
      if (this.closed) {
        reject(new Error("WebSocket is closed."));
        return;
      }
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC ${tag} timed out.`));
      }, REQUEST_TIMEOUT_MS);
      const onAbort = () => {
        this.pending.delete(id);
        clearTimeout(timeoutId);
        this.safeSend(encodeInterrupt(id));
        reject(signal ? abortReason(signal) : new Error(`RPC ${tag} aborted.`));
      };
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          reject(abortReason(signal));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
      this.pending.set(id, {
        resolve: (next) => {
          if (signal) signal.removeEventListener("abort", onAbort);
          resolve(next);
        },
        reject: (error) => {
          if (signal) signal.removeEventListener("abort", onAbort);
          reject(error);
        },
        timeoutId,
      });
      this.safeSend(encodeRequest(id, tag, payload));
    });
    return decode(value);
  }

  subscribe(
    tag: string,
    payload: unknown,
    handlers: {
      readonly onItem: (value: unknown) => void;
      readonly onError?: (error: unknown) => void;
      readonly onClose?: () => void;
    },
  ): { readonly requestId: string; readonly stop: () => void } {
    const requestId = this.nextRequestId();
    this.streams.set(requestId, {
      onItem: handlers.onItem,
      onError: handlers.onError ?? (() => undefined),
      onClose: handlers.onClose ?? (() => undefined),
    });
    this.safeSend(encodeRequest(requestId, tag, payload));
    return {
      requestId,
      stop: () => {
        const stream = this.streams.get(requestId);
        if (!stream) return;
        this.streams.delete(requestId);
        this.safeSend(encodeInterrupt(requestId));
        stream.onClose();
      },
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.failAll(new Error("WebSocket closed."));
    this.socket.removeEventListener("message", this.onMessage);
    this.socket.removeEventListener("close", this.onSocketClosed);
    this.socket.removeEventListener("error", this.onSocketClosed);
    try {
      this.socket.close();
    } catch {
      return;
    }
  }

  private nextRequestId(): string {
    const id = String(this.nextId);
    this.nextId += 1;
    return id;
  }

  private safeSend(data: string): void {
    if (this.closed || this.socket.readyState !== 1) return;
    this.socket.send(data);
  }

  private readonly onMessage = (event: SocketMessageEvent) => {
    const raw = typeof event.data === "string" ? event.data : String(event.data);
    const frame = decodeFrame(raw);
    if (!frame) return;
    switch (frame._tag) {
      case "Ping":
        this.safeSend(encodePong());
        return;
      case "Exit": {
        const pending = this.pending.get(frame.requestId);
        if (pending) {
          this.pending.delete(frame.requestId);
          clearTimeout(pending.timeoutId);
          if (frame.exit._tag === "Success") {
            pending.resolve(frame.exit.value);
          } else {
            const failure = extractRpcFailure(frame.exit.cause);
            pending.reject(Object.assign(new Error(failure.message), failure));
          }
          return;
        }
        const stream = this.streams.get(frame.requestId);
        if (!stream) return;
        this.streams.delete(frame.requestId);
        if (frame.exit._tag === "Failure") {
          const failure = extractRpcFailure(frame.exit.cause);
          stream.onError(Object.assign(new Error(failure.message), failure));
        }
        stream.onClose();
        return;
      }
      case "Chunk": {
        const stream = this.streams.get(frame.requestId);
        if (!stream) return;
        this.safeSend(encodeAck(frame.requestId));
        for (const value of frame.values) {
          stream.onItem(value);
        }
        return;
      }
      case "Eof": {
        const stream = this.streams.get(frame.requestId);
        if (!stream) return;
        this.streams.delete(frame.requestId);
        stream.onClose();
        return;
      }
      default:
        return;
    }
  };

  private readonly onSocketClosed = () => {
    if (this.closed) return;
    this.closed = true;
    this.failAll(new Error("WebSocket closed."));
  };

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
    for (const stream of this.streams.values()) {
      stream.onError(error);
      stream.onClose();
    }
    this.streams.clear();
  }
}

export function waitForSocketOpen(socket: WebSocket, signal?: AbortSignal): Promise<void> {
  if (socket.readyState === 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed before it opened."));
    };
    const onAbort = () => {
      cleanup();
      reject(signal ? abortReason(signal) : new Error("WebSocket open aborted."));
    };
    const cleanup = () => {
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onClose);
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onClose);
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(abortReason(signal));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
