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
});
