import type {
  BrowserDesktopInstanceId,
  BrowserFrameSequence,
  BrowserGeneration,
  BrowserInputDispatchRequest,
  BrowserTabId,
  ThreadId,
} from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import type { DesktopBrowserManager } from "../browserManager";
import {
  BrowserBlockingSurfaceStore,
  BrowserMouseMoveCoalescer,
  BrowserRemoteFrameController,
  marksRemoteHumanControl,
  requireRemotelyAnswerableSurface,
  validateBrowserInputFence,
} from "./controller";

const desktopInstanceId = "11111111-1111-4111-8111-111111111111" as BrowserDesktopInstanceId;
const threadId = "thread-1" as ThreadId;
const tabId = "22222222-2222-4222-8222-222222222222" as BrowserTabId;

const request = (
  overrides: Partial<BrowserInputDispatchRequest> = {},
): BrowserInputDispatchRequest => ({
  desktopInstanceId,
  threadId,
  tabId,
  generation: 2 as BrowserGeneration,
  seq: 7 as BrowserFrameSequence,
  origin: "human",
  event: { kind: "mouse", type: "mousePressed", x: 10, y: 20, button: "left" },
  ...overrides,
});

const state = {
  desktopInstanceId,
  threadId,
  tabId,
  generation: 2 as BrowserGeneration,
  seq: 7 as BrowserFrameSequence,
  streaming: true,
};

describe("validateBrowserInputFence", () => {
  it("accepts the displayed frame and older produced frames in the live generation", () => {
    expect(validateBrowserInputFence(request(), state)).toBeNull();
    expect(
      validateBrowserInputFence(request({ seq: 4 as BrowserFrameSequence }), state),
    ).toBeNull();
  });

  it("rejects stale generations and future sequence numbers independently", () => {
    expect(validateBrowserInputFence(request({ generation: 1 as BrowserGeneration }), state)).toBe(
      "stale-generation",
    );
    expect(validateBrowserInputFence(request({ seq: 8 as BrowserFrameSequence }), state)).toBe(
      "stale-frame",
    );
  });

  it("rejects debugger replacement and foreign desktop, thread, and tab targets", () => {
    expect(validateBrowserInputFence(request(), { ...state, streaming: false })).toBe(
      "target-detached",
    );
    expect(
      validateBrowserInputFence(
        request({
          desktopInstanceId: "44444444-4444-4444-8444-444444444444" as BrowserDesktopInstanceId,
        }),
        state,
      ),
    ).toBe("wrong-desktop");
    expect(validateBrowserInputFence(request({ threadId: "thread-2" as ThreadId }), state)).toBe(
      "wrong-thread",
    );
    expect(
      validateBrowserInputFence(
        request({ tabId: "33333333-3333-4333-8333-333333333333" as BrowserTabId }),
        state,
      ),
    ).toBe("wrong-tab");
  });
});

describe("browser input arbitration", () => {
  it("marks wheel input but not mouse movement as human control", () => {
    expect(
      marksRemoteHumanControl(
        request({
          event: {
            kind: "wheel",
            type: "mouseWheel",
            x: 10,
            y: 20,
            deltaX: 0,
            deltaY: 120,
          },
        }),
      ),
    ).toBe(true);
    expect(
      marksRemoteHumanControl(
        request({ event: { kind: "mouse", type: "mouseMoved", x: 10, y: 20 } }),
      ),
    ).toBe(false);
  });

  it("dispatches the latest mouse position after an in-flight move settles", async () => {
    const coalescer = new BrowserMouseMoveCoalescer();
    const sent: number[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const send = async (input: BrowserInputDispatchRequest) => {
      const event = input.event;
      if (event.kind !== "mouse") throw new Error("Expected mouse input");
      sent.push(event.x);
      if (sent.length === 1) await firstBlocked;
      return { accepted: true, generation: input.generation, seq: input.seq } as const;
    };
    const first = coalescer.dispatch(
      request({ event: { kind: "mouse", type: "mouseMoved", x: 10, y: 20 } }),
      send,
    );
    const second = coalescer.dispatch(
      request({ event: { kind: "mouse", type: "mouseMoved", x: 20, y: 20 } }),
      send,
    );
    const third = coalescer.dispatch(
      request({ event: { kind: "mouse", type: "mouseMoved", x: 30, y: 20 } }),
      send,
    );

    expect(sent).toEqual([10]);
    releaseFirst();
    await Promise.all([first, second, third]);
    expect(sent).toEqual([10, 30]);
  });
});

describe("browser blocking-surface lifecycle", () => {
  it("adds and clears dialogs, native inputs, navigations, tab closes, and generation resets", () => {
    const store = new BrowserBlockingSurfaceStore();
    store.setJavaScriptDialog(tabId, {
      kind: "prompt",
      message: "Continue?",
      defaultPrompt: "yes",
      openedAt: "2026-08-22T08:00:00.000Z",
    });
    expect(store.snapshot()).toEqual([
      expect.objectContaining({
        kind: "javascript-dialog",
        dialogKind: "prompt",
        remotelyAnswerable: true,
      }),
    ]);

    store.addNativeInput(tabId, { kind: "file-chooser", inputType: "file" });
    store.setJavaScriptDialog(tabId, null);
    expect(store.snapshot()).toEqual([expect.objectContaining({ kind: "file-chooser" })]);

    expect(store.snapshot()[0]).toMatchObject({ remotelyAnswerable: false });
    expect(store.clearTab(tabId)).toBe(true);
    expect(store.snapshot()).toEqual([]);

    store.addNativeInput(tabId, { kind: "native-widget", inputType: "date" });
    store.addPermissionDenied(tabId, "camera");
    expect(store.snapshot()).toContainEqual(
      expect.objectContaining({
        kind: "permission-prompt",
        permission: "camera",
        autoResolution: "denied",
      }),
    );
    expect(store.clearAll()).toBe(true);
    expect(store.snapshot()).toEqual([]);
  });

  it("rejects a blocking surface that the resolve RPC cannot answer", () => {
    const store = new BrowserBlockingSurfaceStore();
    store.addNativeInput(tabId, { kind: "file-chooser", inputType: "file" });

    expect(() => requireRemotelyAnswerableSurface(store.snapshot()[0])).toThrow(
      "cannot be answered remotely",
    );
  });

  it("serves reveal and rejects a non-answerable surface through desktop RPC handling", async () => {
    const browserManager = {
      subscribe: () => () => undefined,
      deactivateRemoteRuntime: () => undefined,
    } as unknown as DesktopBrowserManager;
    const controller = new BrowserRemoteFrameController(browserManager, {
      revealDesktopWindow: () => false,
    });
    const access = controller as unknown as {
      createSession(
        threadId: ThreadId,
        viewport: { width: number; height: number; deviceScaleFactor: number },
      ): {
        lifecycle: {
          transition(input: { type: "subscribe" }): unknown;
          snapshot(): { generation: number };
        };
        blockingSurfaces: BrowserBlockingSurfaceStore;
      };
    };
    const session = access.createSession(threadId, {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    });
    session.lifecycle.transition({ type: "subscribe" });
    const generation = session.lifecycle.snapshot().generation as BrowserGeneration;

    await expect(
      controller.handleRequest({
        type: "revealDesktopWindow",
        input: { threadId, expectedGeneration: generation, reason: "javascript-dialog" },
      }),
    ).resolves.toEqual({
      type: "desktopWindowRevealed",
      result: {
        revealed: false,
        fallbackText:
          "Open Luminor from your desktop or task switcher to continue in the desktop window.",
      },
    });

    session.blockingSurfaces.addNativeInput(tabId, {
      kind: "file-chooser",
      inputType: "file",
    });
    await expect(
      controller.handleRequest({
        type: "resolveBlockingSurface",
        input: {
          threadId,
          expectedGeneration: generation,
          surfaceId: session.blockingSurfaces.snapshot()[0]!.id,
          resolution: { action: "dismiss" },
        },
      }),
    ).rejects.toThrow("cannot be answered remotely");
    controller.dispose();
  });
});
