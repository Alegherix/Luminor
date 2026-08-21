import { describe, expect, it } from "vitest";

import { BinaryFrameTransport, makeBinaryFrameSink } from "./frameTransport";

describe("BinaryFrameTransport", () => {
  it("retains each authenticated principal", () => {
    const transport = new BinaryFrameTransport<string, { id: string }>({
      queueLimit: 1,
      socketBudgetBytes: 1_024,
      overflowPolicy: "replace-latest",
    });
    const id = transport.subscribe(
      "thread-1",
      { id: "account-1" },
      {
        send: () => undefined,
        bufferedAmount: () => 0,
        isOpen: () => true,
      },
    );
    expect(transport.getStats(id)?.principal).toEqual({ id: "account-1" });
  });

  it("replaces an unsent frame for a slow subscriber", async () => {
    const delivered: number[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const transport = new BinaryFrameTransport<string, string>({
      queueLimit: 1,
      socketBudgetBytes: 1_024,
      overflowPolicy: "replace-latest",
    });
    const id = transport.subscribe("thread-1", "account-1", {
      send: (bytes) => {
        delivered.push(bytes[0] ?? -1);
        return delivered.length === 1 ? firstWrite : undefined;
      },
      bufferedAmount: () => 0,
      isOpen: () => true,
    });
    transport.publish("thread-1", { bytes: new Uint8Array([1]) });
    transport.publish("thread-1", { bytes: new Uint8Array([2]) });
    transport.publish("thread-1", { bytes: new Uint8Array([3]) });
    expect(transport.getStats(id)?.queued).toBe(1);
    expect(transport.getStats(id)?.dropped).toBe(1);
    releaseFirst?.();
    await firstWrite;
    await Promise.resolve();
    expect(delivered).toEqual([1, 3]);
  });

  it("preserves asynchronous sink backpressure", async () => {
    let release: (() => void) | undefined;
    const write = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sink = makeBinaryFrameSink({
      send: () => write,
      isOpen: () => true,
    });
    const pending = sink.send(new Uint8Array([1, 2, 3]));
    expect(pending).toBeInstanceOf(Promise);
    expect(sink.bufferedAmount()).toBe(3);
    release?.();
    await pending;
    expect(sink.bufferedAmount()).toBe(0);
  });
});
