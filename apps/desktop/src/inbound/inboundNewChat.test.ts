import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@luminor/contracts";
import { describe, expect, it, vi } from "vitest";

import { createInboundNewChatRuntime } from "./inboundNewChat";
import type { InboundNewChatArgv } from "./parseInboundArgv";

function command(overrides?: Partial<InboundNewChatArgv>): InboundNewChatArgv {
  return {
    promptFile: "/tmp/luminor-inbound.md",
    submit: true,
    folderName: "Crashes",
    ...overrides,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createRuntime(options?: {
  readonly prompt?: string;
  readonly readError?: Error;
  readonly unlinkError?: Error;
  readonly wait?: Promise<void>;
  readonly fetchImpl?: ReturnType<typeof vi.fn<typeof fetch>>;
  readonly threadId?: string;
  readonly status?: number;
  readonly body?: unknown;
}) {
  const files = new Map<string, string>([
    ["/tmp/luminor-inbound.md", options?.prompt ?? "hello\n"],
  ]);
  const log = vi.fn();
  const navigateToThread = vi.fn();
  const unlinked: string[] = [];
  const fetchImpl =
    options?.fetchImpl ??
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(options?.body ?? { threadId: options?.threadId ?? "thread-1" }), {
        status: options?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

  const runtime = createInboundNewChatRuntime({
    readFile: async (path) => {
      if (options?.readError) {
        throw options.readError;
      }
      const contents = files.get(path);
      if (contents === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return contents;
    },
    unlink: async (path) => {
      if (options?.unlinkError) {
        throw options.unlinkError;
      }
      unlinked.push(path);
      files.delete(path);
    },
    fetchImpl,
    waitUntilReady: async () => {
      if (options?.wait) {
        await options.wait;
      }
    },
    getBackendHttpUrl: () => "http://127.0.0.1:58090",
    getBackendAuthToken: () => "secret-token",
    navigateToThread,
    log,
  });

  return { runtime, fetchImpl, navigateToThread, log, unlinked, files };
}

describe("inboundNewChat", () => {
  it("reads and deletes the prompt file, POSTs JSON, then navigates", async () => {
    const { runtime, fetchImpl, navigateToThread, unlinked } = createRuntime({
      prompt: "Diagnose this crash\n",
      threadId: "thr_abc",
    });

    await runtime.enqueue(
      command({ title: "Process crashed: node", folderName: "Crashes", submit: true }),
    );

    expect(unlinked).toEqual(["/tmp/luminor-inbound.md"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:58090/internal/inbound/new-chat");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Process crashed: node",
      prompt: "Diagnose this crash\n",
      folderName: "Crashes",
      submit: true,
    });
    expect(navigateToThread).toHaveBeenCalledWith("thr_abc");
  });

  it("defaults the title to the first non-empty prompt line, trimmed to 80 chars", async () => {
    const longLine = `  ${"a".repeat(100)}  `;
    const { runtime, fetchImpl } = createRuntime({
      prompt: `\n\n${longLine}\nsecond line\n`,
    });

    await runtime.enqueue(command({ submit: false }));

    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      title: "a".repeat(80),
      submit: false,
    });
  });

  it("rejects an empty prompt and does not delete the file", async () => {
    const { runtime, fetchImpl, navigateToThread, unlinked, log } = createRuntime({
      prompt: "  \n\n",
    });

    await runtime.enqueue(command());

    expect(unlinked).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(navigateToThread).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  it("rejects an oversize prompt and does not delete the file", async () => {
    const { runtime, fetchImpl, unlinked, navigateToThread } = createRuntime({
      prompt: "x".repeat(PROVIDER_SEND_TURN_MAX_INPUT_CHARS + 1),
    });

    await runtime.enqueue(command());

    expect(unlinked).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(navigateToThread).not.toHaveBeenCalled();
  });

  it("logs unlink failures and still POSTs", async () => {
    const { runtime, fetchImpl, navigateToThread, log } = createRuntime({
      unlinkError: new Error("EACCES"),
      threadId: "thr_keep",
    });

    await runtime.enqueue(command());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(navigateToThread).toHaveBeenCalledWith("thr_keep");
    expect(log).toHaveBeenCalled();
  });

  it("does not delete the prompt file when the read fails", async () => {
    const unlink = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>();
    const runtime = createInboundNewChatRuntime({
      readFile: async () => {
        throw new Error("EACCES");
      },
      unlink,
      fetchImpl,
      waitUntilReady: async () => undefined,
      getBackendHttpUrl: () => "http://127.0.0.1:1",
      getBackendAuthToken: () => "token",
      navigateToThread: vi.fn(),
      log: vi.fn(),
    });

    await runtime.enqueue(command());

    expect(unlink).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("waits until the backend is ready before POSTing", async () => {
    const ready = deferred<void>();
    const { runtime, fetchImpl } = createRuntime({ wait: ready.promise });

    const pending = runtime.enqueue(command());
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();

    ready.resolve();
    await pending;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("runs queued commands FIFO so two commands become two threads", async () => {
    const firstReady = deferred<void>();
    let waitCalls = 0;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ threadId: "thread-a" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ threadId: "thread-b" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const navigateToThread = vi.fn();
    const runtime = createInboundNewChatRuntime({
      readFile: async () => "prompt",
      unlink: async () => undefined,
      fetchImpl,
      waitUntilReady: async () => {
        waitCalls += 1;
        if (waitCalls === 1) {
          await firstReady.promise;
        }
      },
      getBackendHttpUrl: () => "http://127.0.0.1:9",
      getBackendAuthToken: () => "token",
      navigateToThread,
      log: vi.fn(),
    });

    const first = runtime.enqueue(command({ promptFile: "/tmp/a.md" }));
    const second = runtime.enqueue(command({ promptFile: "/tmp/b.md" }));
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();

    firstReady.resolve();
    await Promise.all([first, second]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(navigateToThread.mock.calls.map((call) => call[0])).toEqual(["thread-a", "thread-b"]);
  });
});
