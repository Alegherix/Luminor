import type {
  BrowserDesktopInstanceId,
  BrowserFrameSequence,
  BrowserGeneration,
  BrowserInputDispatchRequest,
  BrowserTabId,
  ThreadId,
} from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import {
  BrowserMouseMoveCoalescer,
  marksRemoteHumanControl,
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
