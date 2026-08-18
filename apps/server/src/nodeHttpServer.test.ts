import http from "node:http";
import net, { type Socket } from "node:net";
import type { Duplex } from "node:stream";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { Deferred, Effect, Exit, Scope } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { makeBoundedNodeHttpServer } from "./nodeHttpServer";
import { firstTailscaleIpv4, lookupTailscaleIpv4, resolveRemoteListenTarget } from "./remoteListen";

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
}

function waitForClose(socket: Duplex): Promise<void> {
  if (socket.destroyed) return Promise.resolve();
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 1_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${label}`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function openPendingUpgrade(port: number, server: http.Server) {
  const upgraded = new Promise<Duplex>((resolve) => {
    server.once("upgrade", (_request, socket) => resolve(socket));
  });
  const client = net.createConnection({ host: "127.0.0.1", port });
  // A reset is expected in these tests and must not become a client-side
  // unhandled event either.
  client.on("error", () => undefined);
  return waitForConnect(client).then(() => {
    client.write(
      [
        "GET /hold HTTP/1.1",
        `Host: 127.0.0.1:${port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "",
        "",
      ].join("\r\n"),
    );
    return upgraded.then((socket) => ({ client, socket }));
  });
}

describe("bounded Node HTTP server socket lifecycle", () => {
  it("survives peer resets while a WebSocket upgrade route is still pending", async () => {
    const scope = await Effect.runPromise(Scope.make("sequential"));
    let nodeServer: http.Server | null = null;
    let serverForCleanup: http.Server | undefined;
    const activeSockets = new Set<Duplex>();
    let releasePendingUpgrades = () => Promise.resolve(false);

    try {
      const port = await Effect.runPromise(
        Scope.provide(
          Effect.gen(function* () {
            const pendingUpgradeGate = yield* Deferred.make<void>();
            releasePendingUpgrades = () =>
              Effect.runPromise(Deferred.succeed(pendingUpgradeGate, undefined));
            const httpServer = yield* makeBoundedNodeHttpServer(
              () => {
                nodeServer = http.createServer();
                return nodeServer;
              },
              { host: "127.0.0.1", port: 0 },
            );
            const httpApp = Effect.gen(function* () {
              const request = yield* HttpServerRequest.HttpServerRequest;
              if (request.url === "/hold") {
                yield* Deferred.await(pendingUpgradeGate);
              }
              return HttpServerResponse.text("ok");
            });
            yield* httpServer.serve(httpApp);
            const address = nodeServer?.address();
            if (!address || typeof address === "string") {
              return yield* Effect.die(new Error("Expected a TCP server address"));
            }
            return address.port;
          }).pipe(Effect.provide(NodeServices.layer)),
          scope,
        ),
      );
      const server = nodeServer;
      if (!server) throw new Error("Expected the Node HTTP server");
      serverForCleanup = server;

      // Exercise an actual TCP RST from a client while the Effect upgrade
      // handler is waiting and `ws.handleUpgrade()` has not run yet.
      const first = await withTimeout(openPendingUpgrade(port, server), "first upgrade");
      activeSockets.add(first.client);
      activeSockets.add(first.socket);
      const firstClosed = waitForClose(first.socket);
      first.client.resetAndDestroy();
      await withTimeout(firstClosed, "first reset close");

      // Make the failure deterministic across kernels: this is the exact
      // EventEmitter condition that previously terminated the Node process.
      const second = await withTimeout(openPendingUpgrade(port, server), "second upgrade");
      activeSockets.add(second.client);
      activeSockets.add(second.socket);
      const reset = Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
        errno: -54,
        syscall: "read",
      });
      expect(second.socket.listenerCount("error")).toBeGreaterThan(0);
      expect(() => second.socket.emit("error", reset)).not.toThrow();
      await withTimeout(waitForClose(second.socket), "synthetic reset close");
      second.client.destroy();

      // The transport remains healthy after both resets.
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    } finally {
      for (const socket of activeSockets) socket.destroy();
      serverForCleanup?.closeAllConnections();
      await releasePendingUpgrades();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
});

describe("remote companion listen target", () => {
  it("skips remote listen when tailscale IPv4 is unavailable", () => {
    expect(
      resolveRemoteListenTarget({
        primaryHost: "127.0.0.1",
        configuredRemoteHost: undefined,
        configuredRemotePort: undefined,
        tailscaleIpv4: undefined,
        publicUrl: undefined,
        allowInsecureRemote: true,
        authToken: "desktop-secret",
        devUrl: undefined,
      }),
    ).toEqual({
      kind: "skip",
      reason: "no LUMINOR_REMOTE_HOST and tailscale IPv4 unavailable",
    });
    expect(firstTailscaleIpv4("")).toBeUndefined();
    expect(firstTailscaleIpv4("not-an-ip")).toBeUndefined();
    expect(firstTailscaleIpv4("100.64.1.20\n100.64.1.21")).toBe("100.64.1.20");
  });

  it("still listens on Tailscale when Electron is in Vite dev mode", () => {
    expect(
      resolveRemoteListenTarget({
        primaryHost: "127.0.0.1",
        configuredRemoteHost: undefined,
        configuredRemotePort: undefined,
        tailscaleIpv4: "100.97.93.118",
        publicUrl: undefined,
        allowInsecureRemote: true,
        authToken: "desktop-secret",
        devUrl: new URL("http://localhost:5733/"),
      }),
    ).toEqual({ kind: "listen", host: "100.97.93.118", port: 3773 });
  });

  it("selects an explicit remote host over tailscale discovery", () => {
    expect(
      resolveRemoteListenTarget({
        primaryHost: "127.0.0.1",
        configuredRemoteHost: "100.64.1.20",
        configuredRemotePort: 3773,
        tailscaleIpv4: "100.99.0.1",
        publicUrl: undefined,
        allowInsecureRemote: true,
        authToken: "desktop-secret",
        devUrl: undefined,
      }),
    ).toEqual({ kind: "listen", host: "100.64.1.20", port: 3773 });
  });

  it("does not treat a missing tailscale binary as a fatal lookup", () => {
    expect(() => lookupTailscaleIpv4()).not.toThrow();
  });
});

describe("additional Node HTTP listen", () => {
  it("serves the same Effect app on a second bind", async () => {
    const scope = await Effect.runPromise(Scope.make("sequential"));
    let loopbackServer: http.Server | null = null;
    let remoteServer: http.Server | null = null;
    try {
      const ports = await Effect.runPromise(
        Scope.provide(
          Effect.gen(function* () {
            const httpApp = Effect.succeed(HttpServerResponse.text("shared"));
            const loopback = yield* makeBoundedNodeHttpServer(
              () => {
                loopbackServer = http.createServer();
                return loopbackServer;
              },
              { host: "127.0.0.1", port: 0 },
            );
            yield* loopback.serve(httpApp);
            const remote = yield* makeBoundedNodeHttpServer(
              () => {
                remoteServer = http.createServer();
                return remoteServer;
              },
              { host: "127.0.0.2", port: 0 },
            );
            yield* remote.serve(httpApp);
            const loopbackAddress = loopbackServer?.address();
            const remoteAddress = remoteServer?.address();
            if (
              !loopbackAddress ||
              typeof loopbackAddress === "string" ||
              !remoteAddress ||
              typeof remoteAddress === "string"
            ) {
              return yield* Effect.die(new Error("Expected TCP server addresses"));
            }
            return { loopbackPort: loopbackAddress.port, remotePort: remoteAddress.port };
          }).pipe(Effect.provide(NodeServices.layer)),
          scope,
        ),
      );

      const loopbackResponse = await fetch(`http://127.0.0.1:${ports.loopbackPort}/`);
      const remoteResponse = await fetch(`http://127.0.0.2:${ports.remotePort}/`);
      expect(loopbackResponse.status).toBe(200);
      expect(remoteResponse.status).toBe(200);
      expect(await loopbackResponse.text()).toBe("shared");
      expect(await remoteResponse.text()).toBe("shared");
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });

  it("surfaces a port-in-use error without taking down the first listener", async () => {
    const occupied = net.createServer();
    await new Promise<void>((resolve, reject) => {
      occupied.once("error", reject);
      occupied.listen({ host: "127.0.0.2", port: 0 }, () => resolve());
    });
    const occupiedAddress = occupied.address();
    if (!occupiedAddress || typeof occupiedAddress === "string") {
      occupied.close();
      throw new Error("Expected occupied TCP address");
    }

    const scope = await Effect.runPromise(Scope.make("sequential"));
    let loopbackServer: http.Server | null = null;
    try {
      const loopbackPort = await Effect.runPromise(
        Scope.provide(
          Effect.gen(function* () {
            const httpApp = Effect.succeed(HttpServerResponse.text("loopback"));
            const loopback = yield* makeBoundedNodeHttpServer(
              () => {
                loopbackServer = http.createServer();
                return loopbackServer;
              },
              { host: "127.0.0.1", port: 0 },
            );
            yield* loopback.serve(httpApp);
            const address = loopbackServer?.address();
            if (!address || typeof address === "string") {
              return yield* Effect.die(new Error("Expected a TCP server address"));
            }
            const remote = yield* makeBoundedNodeHttpServer(() => http.createServer(), {
              host: "127.0.0.2",
              port: occupiedAddress.port,
            }).pipe(Effect.result);
            expect(remote._tag).toBe("Failure");
            return address.port;
          }).pipe(Effect.provide(NodeServices.layer)),
          scope,
        ),
      );

      const response = await fetch(`http://127.0.0.1:${loopbackPort}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("loopback");
    } finally {
      occupied.close();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
});
