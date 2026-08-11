import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { makePreviewPortAllocator } from "./portAllocation";

describe("makePreviewPortAllocator", () => {
  it("keeps concurrent allocations distinct while both reservations are in flight", async () => {
    const allocator = await Effect.runPromise(
      makePreviewPortAllocator(() => Effect.succeed(true), {
        minPort: 51_730,
        maxPort: 51_731,
      }),
    );

    const reservations = await Effect.runPromise(
      Effect.all([allocator.allocate, allocator.allocate], { concurrency: "unbounded" }),
    );

    expect(reservations.map(({ port }) => port)).toEqual([51_730, 51_731]);
  });

  it("makes a released reservation available again", async () => {
    const allocator = await Effect.runPromise(
      makePreviewPortAllocator(() => Effect.succeed(true), {
        minPort: 51_730,
        maxPort: 51_730,
      }),
    );

    const first = await Effect.runPromise(allocator.allocate);
    await Effect.runPromise(first.release);
    const second = await Effect.runPromise(allocator.allocate);

    expect(second.port).toBe(first.port);
  });

  it("skips ports that are not available on loopback", async () => {
    const checked: number[] = [];
    const allocator = await Effect.runPromise(
      makePreviewPortAllocator(
        (port) =>
          Effect.sync(() => {
            checked.push(port);
            return port === 51_731;
          }),
        { minPort: 51_730, maxPort: 51_731 },
      ),
    );

    const reservation = await Effect.runPromise(allocator.allocate);

    expect(checked).toEqual([51_730, 51_731]);
    expect(reservation.port).toBe(51_731);
  });
});
