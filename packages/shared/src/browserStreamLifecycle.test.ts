import { describe, expect, it } from "vitest";

import { BrowserStreamLifecycle } from "./browserStreamLifecycle";

describe("BrowserStreamLifecycle", () => {
  it("moves through start, stream, stop, and stopped", () => {
    const lifecycle = new BrowserStreamLifecycle();
    expect(lifecycle.transition({ type: "subscribe" })).toMatchObject({
      state: "starting",
      generation: 1,
      reason: "start",
    });
    expect(lifecycle.transition({ type: "started" }).state).toBe("streaming");
    expect(lifecycle.transition({ type: "unsubscribe" })).toMatchObject({
      state: "stopping",
      generation: 2,
      reason: "stop",
      invalidatedGeneration: 1,
    });
    expect(lifecycle.transition({ type: "stopped" }).state).toBe("stopped");
  });

  it("fences a replacement debugger session", () => {
    const lifecycle = new BrowserStreamLifecycle();
    lifecycle.transition({ type: "subscribe" });
    lifecycle.transition({ type: "started" });
    expect(lifecycle.transition({ type: "detach" }).state).toBe("detached");
    expect(lifecycle.transition({ type: "reattach" })).toMatchObject({
      state: "starting",
      generation: 2,
      reason: "reattach",
      invalidatedGeneration: 1,
    });
  });

  it("ignores reconfiguration when there are no subscribers", () => {
    const lifecycle = new BrowserStreamLifecycle();
    expect(lifecycle.transition({ type: "reconfigure", reason: "resize" })).toMatchObject({
      state: "stopped",
      generation: 0,
      invalidatedGeneration: null,
    });
  });

  it("fences every rapid tab switch", () => {
    const lifecycle = new BrowserStreamLifecycle();
    lifecycle.transition({ type: "subscribe" });
    lifecycle.transition({ type: "started" });
    const first = lifecycle.transition({ type: "reconfigure", reason: "tab-switch" });
    lifecycle.transition({ type: "started" });
    const second = lifecycle.transition({ type: "reconfigure", reason: "tab-switch" });
    expect(first).toMatchObject({ generation: 2, invalidatedGeneration: 1 });
    expect(second).toMatchObject({ generation: 3, invalidatedGeneration: 2 });
  });

  it("invalidates before publishing stopped state on thread closure", () => {
    const lifecycle = new BrowserStreamLifecycle();
    lifecycle.transition({ type: "subscribe" });
    lifecycle.transition({ type: "started" });
    const stopping = lifecycle.transition({ type: "unsubscribe" });
    expect(stopping.invalidatedGeneration).toBe(1);
    expect(stopping.state).toBe("stopping");
    expect(lifecycle.transition({ type: "stopped" }).state).toBe("stopped");
  });

  it("bumps generation for desktop restart and resets on server restart", () => {
    const lifecycle = new BrowserStreamLifecycle();
    lifecycle.transition({ type: "subscribe" });
    lifecycle.transition({ type: "started" });
    expect(lifecycle.transition({ type: "reconfigure", reason: "desktop-restart" })).toMatchObject({
      generation: 2,
      invalidatedGeneration: 1,
      reason: "desktop-restart",
    });
    const restartedServer = new BrowserStreamLifecycle();
    expect(restartedServer.transition({ type: "subscribe" }).generation).toBe(1);
  });
});
