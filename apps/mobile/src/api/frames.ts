export type RpcRequestFrame = {
  readonly _tag: "Request";
  readonly id: string;
  readonly tag: string;
  readonly payload: unknown;
  readonly headers: readonly [];
};

export type RpcExitSuccessFrame = {
  readonly _tag: "Exit";
  readonly requestId: string;
  readonly exit: {
    readonly _tag: "Success";
    readonly value: unknown;
  };
};

export type RpcExitFailureFrame = {
  readonly _tag: "Exit";
  readonly requestId: string;
  readonly exit: {
    readonly _tag: "Failure";
    readonly cause: unknown;
  };
};

export type RpcChunkFrame = {
  readonly _tag: "Chunk";
  readonly requestId: string;
  readonly values: readonly unknown[];
};

export type RpcPingFrame = {
  readonly _tag: "Ping";
};

export type RpcPongFrame = {
  readonly _tag: "Pong";
};

export type RpcInterruptFrame = {
  readonly _tag: "Interrupt";
  readonly requestId: string;
};

export type RpcAckFrame = {
  readonly _tag: "Ack";
  readonly requestId: string;
};

export type RpcEofFrame = {
  readonly _tag: "Eof";
  readonly requestId: string;
};

export type RpcFrame =
  | RpcRequestFrame
  | RpcExitSuccessFrame
  | RpcExitFailureFrame
  | RpcChunkFrame
  | RpcPingFrame
  | RpcPongFrame
  | RpcInterruptFrame
  | RpcAckFrame
  | RpcEofFrame;

export function encodeRequest(id: string, tag: string, payload: unknown): string {
  const frame: RpcRequestFrame = {
    _tag: "Request",
    id,
    tag,
    payload,
    headers: [],
  };
  return JSON.stringify(frame);
}

export function encodeInterrupt(requestId: string): string {
  const frame: RpcInterruptFrame = { _tag: "Interrupt", requestId };
  return JSON.stringify(frame);
}

export function encodeAck(requestId: string): string {
  const frame: RpcAckFrame = { _tag: "Ack", requestId };
  return JSON.stringify(frame);
}

export function encodePong(): string {
  const frame: RpcPongFrame = { _tag: "Pong" };
  return JSON.stringify(frame);
}

export function decodeFrame(raw: string): RpcFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  switch (record._tag) {
    case "Request":
      if (typeof record.id !== "string" || typeof record.tag !== "string") return null;
      return {
        _tag: "Request",
        id: record.id,
        tag: record.tag,
        payload: record.payload ?? {},
        headers: [],
      };
    case "Exit":
      if (typeof record.requestId !== "string" || !record.exit || typeof record.exit !== "object") {
        return null;
      }
      {
        const exit = record.exit as Record<string, unknown>;
        if (exit._tag === "Success") {
          return {
            _tag: "Exit",
            requestId: record.requestId,
            exit: { _tag: "Success", value: exit.value },
          };
        }
        if (exit._tag === "Failure") {
          return {
            _tag: "Exit",
            requestId: record.requestId,
            exit: { _tag: "Failure", cause: exit.cause },
          };
        }
      }
      return null;
    case "Chunk":
      if (typeof record.requestId !== "string" || !Array.isArray(record.values)) return null;
      return {
        _tag: "Chunk",
        requestId: record.requestId,
        values: record.values,
      };
    case "Ping":
      return { _tag: "Ping" };
    case "Pong":
      return { _tag: "Pong" };
    case "Interrupt":
      if (typeof record.requestId !== "string") return null;
      return { _tag: "Interrupt", requestId: record.requestId };
    case "Ack":
      if (typeof record.requestId !== "string") return null;
      return { _tag: "Ack", requestId: record.requestId };
    case "Eof":
      if (typeof record.requestId !== "string") return null;
      return { _tag: "Eof", requestId: record.requestId };
    default:
      return null;
  }
}

function walkRpcFailure(
  value: unknown,
): { readonly message: string; readonly code?: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") {
    return typeof record.code === "string"
      ? { message: record.message, code: record.code }
      : { message: record.message };
  }
  if (record.error !== undefined) {
    const nested = walkRpcFailure(record.error);
    if (nested) return nested;
  }
  if (record.failure !== undefined) {
    const nested = walkRpcFailure(record.failure);
    if (nested) return nested;
  }
  if (Array.isArray(record.failures)) {
    for (const item of record.failures) {
      const nested = walkRpcFailure(item);
      if (nested) return nested;
    }
  }
  return null;
}

export function extractRpcFailure(cause: unknown): {
  readonly message: string;
  readonly code?: string;
} {
  return walkRpcFailure(cause) ?? { message: "RPC request failed." };
}
