import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { AuthError } from "./auth/Services/ServerAuth";
import {
  authenticateRpcWebSocketUpgrade,
  authorizeBrowserFrameWebSocketUpgrade,
  authorizeDeviceFrameWebSocketUpgrade,
  canManageExternalMcp,
} from "./wsRpc";

it("reserves external MCP management for owner sessions", () => {
  assert.isTrue(canManageExternalMcp("owner"));
  assert.isFalse(canManageExternalMcp("client"));
});

it.effect("rejects an unauthorized websocket upgrade on a non-loopback bind", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(
        new AuthError({
          message: "Authentication required.",
          status: 401,
        }),
      ),
    );

    const error = yield* authenticateRpcWebSocketUpgrade({
      config: { host: "0.0.0.0", authToken: "remote-secret", publicUrl: undefined },
      legacyToken: null,
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://192.168.1.50:3773/ws"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    }).pipe(Effect.flip);

    assert.equal(error.status, 401);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
  }),
);

it.effect("does not accept a legacy query token on a non-loopback bind", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(
        new AuthError({
          message: "Authentication required.",
          status: 401,
        }),
      ),
    );

    const error = yield* authenticateRpcWebSocketUpgrade({
      config: { host: "192.168.1.50", authToken: "remote-secret", publicUrl: undefined },
      legacyToken: "remote-secret",
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://192.168.1.50:3773/ws?token=remote-secret"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    }).pipe(Effect.flip);

    assert.equal(error.status, 401);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
  }),
);

it.effect("accepts an authenticated session on a non-loopback bind", () =>
  Effect.gen(function* () {
    const authenticatedSession = {
      sessionId: "remote-session" as never,
      subject: "owner-bootstrap",
      method: "browser-session-cookie" as const,
      role: "owner" as const,
    };
    const authenticateWebSocketUpgrade = vi.fn(() => Effect.succeed(authenticatedSession));

    const session = yield* authenticateRpcWebSocketUpgrade({
      config: { host: "0.0.0.0", authToken: "remote-secret", publicUrl: undefined },
      legacyToken: "remote-secret",
      request: {
        headers: {},
        cookies: { "luminor-session": "paired-session-credential" },
        url: new URL("http://192.168.1.50:3773/ws?token=remote-secret"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    });

    assert.equal(session, authenticatedSession);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
  }),
);

it.effect("preserves the legacy query token for loopback desktop sessions", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(new AuthError({ message: "Unexpected authentication call.", status: 500 })),
    );

    const session = yield* authenticateRpcWebSocketUpgrade({
      config: { host: "127.0.0.1", authToken: "desktop-secret", publicUrl: undefined },
      legacyToken: "desktop-secret",
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://127.0.0.1:3773/ws?token=desktop-secret"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
      localAddress: "127.0.0.1",
    });

    assert.equal(session, null);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 0);
  }),
);

it.effect("rejects a legacy query token on a remote companion socket of a loopback process", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(
        new AuthError({
          message: "Authentication required.",
          status: 401,
        }),
      ),
    );

    const error = yield* authenticateRpcWebSocketUpgrade({
      config: { host: "127.0.0.1", authToken: "desktop-secret", publicUrl: undefined },
      legacyToken: "desktop-secret",
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://100.64.1.20:3773/ws?token=desktop-secret"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
      localAddress: "100.64.1.20",
    }).pipe(Effect.flip);

    assert.equal(error.status, 401);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
  }),
);

it.effect("preserves the legacy loopback token on the device frame socket", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(new AuthError({ message: "Unexpected authentication call.", status: 500 })),
    );

    const authorized = yield* authorizeDeviceFrameWebSocketUpgrade({
      config: { host: "127.0.0.1", authToken: "desktop-secret", publicUrl: undefined },
      legacyToken: "desktop-secret",
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://127.0.0.1:3773/ws/device-frames?token=desktop-secret&udid=device-1"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    });

    assert.isTrue(authorized);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 0);
  }),
);

it.effect("retains a principal for a loopback browser frame socket", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(new AuthError({ message: "Unexpected authentication call.", status: 500 })),
    );
    const principal = yield* authorizeBrowserFrameWebSocketUpgrade({
      config: { host: "127.0.0.1", authToken: "desktop-secret", publicUrl: undefined },
      legacyToken: "desktop-secret",
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://127.0.0.1:3773/ws/browser-frames?token=desktop-secret"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    });
    assert.deepStrictEqual(principal, {
      ownerKind: "local-loopback",
      ownerId: "local-loopback",
    });
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 0);
  }),
);

it.effect("refuses an anonymous browser frame socket even on loopback", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(new AuthError({ message: "Authentication required.", status: 401 })),
    );
    const principal = yield* authorizeBrowserFrameWebSocketUpgrade({
      config: { host: "127.0.0.1", authToken: "desktop-secret", publicUrl: undefined },
      legacyToken: null,
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://127.0.0.1:3773/ws/browser-frames"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    });
    assert.isNull(principal);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
  }),
);

it.effect("does not treat two missing browser frame tokens as authentication", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(new AuthError({ message: "Authentication required.", status: 401 })),
    );
    const principal = yield* authorizeBrowserFrameWebSocketUpgrade({
      config: { host: "127.0.0.1", authToken: undefined, publicUrl: undefined },
      legacyToken: null,
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://127.0.0.1:3773/ws/browser-frames"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    });
    assert.isNull(principal);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
  }),
);

it.effect("rejects an invalid legacy token on a remotely exposed device frame socket", () =>
  Effect.gen(function* () {
    const authenticateWebSocketUpgrade = vi.fn(() =>
      Effect.fail(new AuthError({ message: "Authentication required.", status: 401 })),
    );

    const authorized = yield* authorizeDeviceFrameWebSocketUpgrade({
      config: { host: "0.0.0.0", authToken: "remote-secret", publicUrl: undefined },
      legacyToken: "wrong-secret",
      request: {
        headers: {},
        cookies: {},
        url: new URL("http://192.168.1.50:3773/ws/device-frames?token=wrong-secret&udid=device-1"),
      },
      serverAuth: { authenticateWebSocketUpgrade },
    });

    assert.isFalse(authorized);
    assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
  }),
);

it.effect(
  "disables the legacy loopback query token when an HTTPS public origin is configured",
  () =>
    Effect.gen(function* () {
      const authenticatedSession = {
        sessionId: "proxy-session" as never,
        subject: "owner-bootstrap",
        method: "browser-session-cookie" as const,
        role: "owner" as const,
      };
      const authenticateWebSocketUpgrade = vi.fn(() => Effect.succeed(authenticatedSession));

      const session = yield* authenticateRpcWebSocketUpgrade({
        config: {
          host: "127.0.0.1",
          authToken: "proxy-secret",
          publicUrl: new URL("https://luminor.example.test/"),
        },
        legacyToken: "proxy-secret",
        request: {
          headers: {},
          cookies: { "luminor-session": "paired-session-credential" },
          url: new URL("http://127.0.0.1:3773/ws?token=proxy-secret"),
        },
        serverAuth: { authenticateWebSocketUpgrade },
      });

      assert.equal(session, authenticatedSession);
      assert.equal(authenticateWebSocketUpgrade.mock.calls.length, 1);
    }),
);
