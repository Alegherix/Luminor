import { EventEmitter } from "node:events";

import { ThreadId } from "@luminor/contracts";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";

import type { BrowserAutomationVisibleRuntime } from "../browserManager";
import {
  callFunctionOn,
  DebuggerSessionCoordinator,
  drainOnAbort,
  evaluateInContext,
} from "./cdpRuntime";

const runtimeWithFailure = (): BrowserAutomationVisibleRuntime => ({
  threadId: ThreadId.makeUnsafe("thread-cdp-errors"),
  tabId: "fcb69a74-b5e1-43ad-823a-09a8c8bc42fc",
  webContents: {
    isDestroyed: () => false,
    debugger: {
      isAttached: () => true,
      attach: vi.fn(),
      sendCommand: vi.fn(async () => {
        throw new Error("renderer disconnected after dispatch");
      }),
    },
  } as unknown as WebContents,
});

describe("CDP ambiguous effects", () => {
  it("passes a native Chromium deadline to Runtime.evaluate", async () => {
    const sendCommand = vi.fn(async () => ({ result: { value: "ready" } }));
    const runtime = {
      threadId: ThreadId.makeUnsafe("thread-cdp-timeout"),
      tabId: "3ff525b5-ebd6-46ad-ab82-e20b1fbf7b9a",
      webContents: {
        isDestroyed: () => false,
        debugger: {
          isAttached: () => true,
          attach: vi.fn(),
          sendCommand,
        },
      } as unknown as WebContents,
    } satisfies BrowserAutomationVisibleRuntime;

    await expect(
      evaluateInContext<string>(runtime, "document.readyState", { timeoutMs: 1_000 }),
    ).resolves.toMatchObject({ value: "ready" });
    expect(sendCommand).toHaveBeenCalledWith(
      "Runtime.evaluate",
      expect.objectContaining({ expression: "document.readyState", timeout: 1_000 }),
    );
  });

  it("does not finish internal cancellation draining before cleanup is acknowledged", async () => {
    let rejectOperation!: (error: Error) => void;
    const operation = new Promise<never>((_resolve, reject) => {
      rejectOperation = reject;
    });
    let releaseCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    const controller = new AbortController();
    const draining = drainOnAbort(operation, controller.signal, () => cleanup);

    controller.abort(new Error("turn stopped"));
    rejectOperation(new Error("operation interrupted"));
    let settled = false;
    void draining
      .finally(() => {
        settled = true;
      })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    releaseCleanup();
    await expect(draining).rejects.toThrow("turn stopped");
  });

  it("does not advertise a mutating callFunctionOn transport failure as safely retryable", async () => {
    await expect(
      callFunctionOn(runtimeWithFailure(), "remote-object", "function () { this.click(); }"),
    ).rejects.toMatchObject({
      browserError: {
        code: "BrowserAmbiguousResult",
        retryable: false,
        effectMayHaveCommitted: true,
      },
    });
  });

  it("keeps observation failures retryable while preserving explicit evaluation effects", async () => {
    await expect(evaluateInContext(runtimeWithFailure(), "document.title")).rejects.toMatchObject({
      browserError: {
        code: "BrowserRuntimeDisconnected",
        retryable: true,
        effectMayHaveCommitted: false,
      },
    });

    await expect(
      evaluateInContext(runtimeWithFailure(), "localStorage.clear()", {
        effectMayHaveCommitted: true,
      }),
    ).rejects.toMatchObject({
      browserError: {
        code: "BrowserAmbiguousResult",
        retryable: false,
        effectMayHaveCommitted: true,
      },
    });
  });
});

describe("DebuggerSessionCoordinator", () => {
  const createTarget = () => {
    const debuggerSession = new EventEmitter() as EventEmitter & {
      isAttached: () => boolean;
      attach: () => void;
      sendCommand: ReturnType<typeof vi.fn>;
    };
    let attached = false;
    let destroyed = false;
    debuggerSession.isAttached = () => attached;
    debuggerSession.attach = () => {
      attached = true;
    };
    debuggerSession.sendCommand = vi.fn(async () => ({}));
    const webContents = new EventEmitter() as EventEmitter & {
      debugger: typeof debuggerSession;
      isDestroyed: () => boolean;
    };
    webContents.debugger = debuggerSession;
    webContents.isDestroyed = () => destroyed;
    return {
      debuggerSession,
      webContents: webContents as unknown as WebContents,
      detach: (reason = "replaced-with-devtools") => {
        attached = false;
        debuggerSession.emit("detach", {}, reason);
      },
      destroy: () => {
        destroyed = true;
        webContents.emit("destroyed");
      },
    };
  };

  it("rejects a command carrying a stale debugger session id", async () => {
    const target = createTarget();
    const coordinator = new DebuggerSessionCoordinator(target.webContents);
    const firstSessionId = coordinator.ensureAttached();
    target.detach();
    coordinator.ensureAttached();
    await expect(coordinator.sendCommand("Page.enable", {}, firstSessionId)).rejects.toThrow(
      "Debugger session replaced",
    );
  });

  it("never acknowledges a late command after target destruction", async () => {
    const target = createTarget();
    let resolveCommand!: (value: unknown) => void;
    target.debuggerSession.sendCommand = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCommand = resolve;
        }),
    );
    const coordinator = new DebuggerSessionCoordinator(target.webContents);
    const command = coordinator.sendCommand("Page.enable");
    target.destroy();
    resolveCommand({});
    await expect(command).rejects.toThrow("session invalidation");
  });
});
