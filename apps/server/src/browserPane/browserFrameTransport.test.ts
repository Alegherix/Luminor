import type { BrowserViewerPrincipal, ThreadId } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { BrowserFrameTransport } from "./browserFrameTransport.ts";

describe("BrowserFrameTransport", () => {
  it("retains the authenticated principal on every subscriber", () => {
    const transport = new BrowserFrameTransport();
    const principal: BrowserViewerPrincipal = { ownerKind: "session", ownerId: "session-1" };
    const id = transport.subscribe("thread-1" as ThreadId, principal, {
      send: () => undefined,
      bufferedAmount: () => 0,
      isOpen: () => true,
    });
    expect(transport.stats(id)?.principal).toEqual(principal);
  });

  it("keeps only the latest frame while a subscriber is slow", async () => {
    const transport = new BrowserFrameTransport();
    const sent: number[] = [];
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const id = transport.subscribe(
      "thread-1" as ThreadId,
      { ownerKind: "local-loopback", ownerId: "local-loopback" },
      {
        send: (bytes) => {
          sent.push(bytes[0] ?? -1);
          return sent.length === 1 ? blocked : undefined;
        },
        bufferedAmount: () => 0,
        isOpen: () => true,
      },
    );
    transport.publish("thread-1" as ThreadId, new Uint8Array([1]));
    transport.publish("thread-1" as ThreadId, new Uint8Array([2]));
    transport.publish("thread-1" as ThreadId, new Uint8Array([3]));
    expect(transport.stats(id)).toMatchObject({ queued: 1, dropped: 1 });
    release();
    await blocked;
    await Promise.resolve();
    expect(sent).toEqual([1, 3]);
  });

  it("primes reconnecting subscribers with the latest frame until invalidated", async () => {
    const transport = new BrowserFrameTransport();
    const threadId = "thread-1" as ThreadId;
    transport.publish(threadId, new Uint8Array([7]));
    const first: number[] = [];
    transport.subscribe(
      threadId,
      { ownerKind: "session", ownerId: "session-1" },
      {
        send: (bytes) => {
          first.push(bytes[0] ?? -1);
        },
        bufferedAmount: () => 0,
        isOpen: () => true,
      },
    );
    await Promise.resolve();
    expect(first).toEqual([7]);

    transport.invalidate(threadId);
    const second: number[] = [];
    transport.subscribe(
      threadId,
      { ownerKind: "session", ownerId: "session-1" },
      {
        send: (bytes) => {
          second.push(bytes[0] ?? -1);
        },
        bufferedAmount: () => 0,
        isOpen: () => true,
      },
    );
    await Promise.resolve();
    expect(second).toEqual([]);
  });
});
