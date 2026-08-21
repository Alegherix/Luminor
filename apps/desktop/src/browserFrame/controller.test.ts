import type {
  BrowserDesktopInstanceId,
  BrowserFrameSequence,
  BrowserGeneration,
  BrowserInputDispatchRequest,
  BrowserTabId,
  ThreadId,
} from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { validateBrowserInputFence } from "./controller";

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
  it("accepts only the exact displayed frame", () => {
    expect(validateBrowserInputFence(request(), state)).toBeNull();
  });

  it("rejects stale generation and sequence independently", () => {
    expect(validateBrowserInputFence(request({ generation: 1 as BrowserGeneration }), state)).toBe(
      "stale-generation",
    );
    expect(validateBrowserInputFence(request({ seq: 6 as BrowserFrameSequence }), state)).toBe(
      "stale-frame",
    );
  });

  it("rejects debugger replacement and foreign targets", () => {
    expect(validateBrowserInputFence(request(), { ...state, streaming: false })).toBe(
      "target-detached",
    );
    expect(
      validateBrowserInputFence(
        request({ tabId: "33333333-3333-4333-8333-333333333333" as BrowserTabId }),
        state,
      ),
    ).toBe("wrong-tab");
  });
});
