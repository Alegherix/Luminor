import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import { connectScrcpySocketWithRetry, createScrcpyScid } from "./ScrcpyStream.ts";

describe("createScrcpyScid", () => {
  it.each([
    [0, "00000000"],
    [0.5, "40000000"],
    [1 - Number.EPSILON, "7fffffff"],
  ])("stays within scrcpy's signed 32-bit parser for %s", (random, expected) => {
    expect(createScrcpyScid(() => random)).toBe(expected);
  });
});

describe("connectScrcpySocketWithRetry", () => {
  it("retries an adb-forward connection that closes before stream bytes arrive", async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections += 1;
      if (connections === 1) {
        socket.end();
        return;
      }
      socket.write(new Uint8Array([0, 0, 0, 1, 0x67]));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("missing TCP address");

    const socket = await connectScrcpySocketWithRetry(address.port, {
      attempts: 3,
      retryMs: 0,
    });
    const data = await new Promise<Buffer>((resolve) => socket.once("data", resolve));

    expect(connections).toBe(2);
    expect([...data]).toEqual([0, 0, 0, 1, 0x67]);

    socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
