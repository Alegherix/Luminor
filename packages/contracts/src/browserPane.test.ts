import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  BrowserFrameHeader,
  BrowserInputDispatchRequest,
  BrowserStateStreamEvent,
  BrowserViewerPrincipal,
  ThreadBrowserStateSnapshot,
} from "./browserPane";

const frameHeader = {
  desktopInstanceId: "11111111-1111-4111-8111-111111111111",
  threadId: "thread-1",
  tabId: "22222222-2222-4222-8222-222222222222",
  generation: 2,
  seq: 9,
  jpegW: 1280,
  jpegH: 720,
  deviceWidth: 1280,
  deviceHeight: 720,
  pageScaleFactor: 1,
  offsetTop: 0,
  scrollOffsetX: 0,
  scrollOffsetY: 240,
  timestamp: 123.5,
  captureTs: 456.75,
} as const;

describe("BrowserFrameHeader", () => {
  it("accepts the complete generation-fenced frame identity and metadata", () => {
    expect(Schema.is(BrowserFrameHeader)(frameHeader)).toBe(true);
  });

  it("rejects incomplete metadata and invalid dimensions", () => {
    const { captureTs: _, ...withoutCaptureTimestamp } = frameHeader;
    expect(Schema.is(BrowserFrameHeader)(withoutCaptureTimestamp)).toBe(false);
    expect(Schema.is(BrowserFrameHeader)({ ...frameHeader, jpegW: 0 })).toBe(false);
  });
});

describe("browser pane control contracts", () => {
  it("requires the displayed frame identity and input origin", () => {
    const request = {
      desktopInstanceId: "11111111-1111-4111-8111-111111111111",
      threadId: "thread-1",
      tabId: "22222222-2222-4222-8222-222222222222",
      generation: 2,
      seq: 9,
      origin: "human",
      event: { kind: "mouse", type: "mousePressed", x: 4, y: 8, button: "left" },
    };
    expect(Schema.is(BrowserInputDispatchRequest)(request)).toBe(true);
    const { origin: _, ...withoutOrigin } = request;
    expect(Schema.is(BrowserInputDispatchRequest)(withoutOrigin)).toBe(false);
  });

  it("models viewer principals without collapsing them to authorization booleans", () => {
    expect(
      Schema.is(BrowserViewerPrincipal)({
        ownerKind: "session",
        ownerId: "account-1",
        sessionId: "session-1",
      }),
    ).toBe(true);
  });
});

describe("browser state contracts", () => {
  const snapshot = {
    threadId: "thread-1",
    version: 1,
    open: true,
    activeTabId: null,
    tabs: [],
    lastError: null,
    stream: {
      lifecycle: "stopped",
      identity: null,
      generationReason: null,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      subscriberCount: 0,
    },
  } as const;

  it("validates bootstrap snapshots", () => {
    expect(Schema.is(ThreadBrowserStateSnapshot)(snapshot)).toBe(true);
    expect(
      Schema.is(BrowserStateStreamEvent)({
        type: "browser.state.snapshot",
        state: snapshot,
        reason: "bootstrap",
      }),
    ).toBe(true);
  });

  it("validates invalidation events independently of replacement state", () => {
    expect(
      Schema.is(BrowserStateStreamEvent)({
        type: "browser.state.invalidated",
        threadId: "thread-1",
        previousDesktopInstanceId: "11111111-1111-4111-8111-111111111111",
        previousGeneration: 1,
        reason: "resize",
      }),
    ).toBe(true);
  });
});
