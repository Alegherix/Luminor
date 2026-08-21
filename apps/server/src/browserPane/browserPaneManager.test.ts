import type {
  BrowserDesktopControlResponse,
  BrowserFrameHeader,
  BrowserViewerPrincipal,
  ThreadBrowserStateSnapshot,
} from "@luminor/contracts";
import { describe, expect, it, vi } from "vitest";

import type { BrowserHostControlConnection } from "../browserAutomation/browserHostRpcClient.ts";
import { BrowserPaneManager, browserFrameMatchesState } from "./browserPaneManager.ts";

const desktopInstanceId = "11111111-1111-4111-8111-111111111111";
const tabId = "22222222-2222-4222-8222-222222222222";
const principal: BrowserViewerPrincipal = { ownerKind: "session", ownerId: "session-1" };

const state = (): ThreadBrowserStateSnapshot => ({
  threadId: "thread-1" as ThreadBrowserStateSnapshot["threadId"],
  version: 1,
  open: true,
  activeTabId: tabId as ThreadBrowserStateSnapshot["activeTabId"],
  tabs: [],
  lastError: null,
  stream: {
    lifecycle: "streaming",
    identity: {
      desktopInstanceId:
        desktopInstanceId as ThreadBrowserStateSnapshot["stream"]["identity"] extends infer I
          ? I extends null
            ? never
            : I extends { desktopInstanceId: infer D }
              ? D
              : never
          : never,
      threadId: "thread-1" as ThreadBrowserStateSnapshot["threadId"],
      tabId: tabId as NonNullable<ThreadBrowserStateSnapshot["stream"]["identity"]>["tabId"],
      generation: 1 as NonNullable<ThreadBrowserStateSnapshot["stream"]["identity"]>["generation"],
    },
    generationReason: "start",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    subscriberCount: 1,
  },
});

const createConnection = (): BrowserHostControlConnection => ({
  request: vi.fn(async (request): Promise<BrowserDesktopControlResponse> => {
    if (request.type === "subscribe") {
      return {
        type: "subscribed",
        result: { subscriptionId: "desktop-sub-1", state: state(), authorization: "viewer" },
      };
    }
    if (request.type === "unsubscribe") {
      return { type: "unsubscribed", result: { released: true } };
    }
    if (request.type === "dispatchInput") {
      return {
        type: "input",
        result: { accepted: true, generation: request.input.generation, seq: request.input.seq },
      };
    }
    if (request.type === "getState") return { type: "state", result: { state: state() } };
    return { type: "controlled", result: { state: state() } };
  }),
  subscribeState: () => () => undefined,
  subscribeClose: () => () => undefined,
  close: () => undefined,
});

describe("BrowserPaneManager controller leases", () => {
  it("shares one desktop subscription across concurrent viewers", async () => {
    const connection = createConnection();
    const manager = new BrowserPaneManager({}, { connectControl: async () => connection });
    const input = {
      threadId: state().threadId,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    } as const;
    const [first, second] = await Promise.all([
      manager.subscribeViewer(1, principal, input),
      manager.subscribeViewer(2, { ownerKind: "session", ownerId: "session-2" }, input),
    ]);
    expect(connection.request).toHaveBeenCalledTimes(1);
    await Promise.all([
      manager.unsubscribeViewer(1, input.threadId, first.subscriptionId),
      manager.unsubscribeViewer(2, input.threadId, second.subscriptionId),
    ]);
    expect(connection.request).toHaveBeenCalledTimes(2);
  });

  it("refuses a second controller and revokes the first on disconnect", async () => {
    const manager = new BrowserPaneManager({}, { connectControl: async () => createConnection() });
    await manager.subscribeViewer(1, principal, {
      threadId: state().threadId,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    });
    await manager.subscribeViewer(
      2,
      { ownerKind: "session", ownerId: "session-2" },
      {
        threadId: state().threadId,
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      },
    );
    expect(manager.acquireController(1, principal, state().threadId).granted).toBe(true);
    expect(
      manager.acquireController(
        2,
        { ownerKind: "session", ownerId: "session-2" },
        state().threadId,
      ),
    ).toEqual({ granted: false, reason: "controller-unavailable" });
    manager.disconnect(1);
    await Promise.resolve();
    expect(
      manager.acquireController(2, { ownerKind: "session", ownerId: "session-2" }, state().threadId)
        .granted,
    ).toBe(true);
  });

  it("keeps viewers read-only without a lease", async () => {
    const manager = new BrowserPaneManager({}, { connectControl: async () => createConnection() });
    await manager.subscribeViewer(1, principal, {
      threadId: state().threadId,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    });
    const result = await manager.dispatchInput(1, {
      desktopInstanceId: desktopInstanceId as BrowserFrameHeader["desktopInstanceId"],
      threadId: state().threadId,
      tabId: tabId as BrowserFrameHeader["tabId"],
      generation: 1 as BrowserFrameHeader["generation"],
      seq: 0 as BrowserFrameHeader["seq"],
      origin: "human",
      event: { kind: "insertText", text: "hello" },
    });
    expect(result).toMatchObject({ accepted: false, reason: "controller-required" });
  });

  it("authorizes frame sockets by retained principal identity", async () => {
    const manager = new BrowserPaneManager({}, { connectControl: async () => createConnection() });
    await manager.subscribeViewer(1, principal, {
      threadId: state().threadId,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    });
    expect(manager.isPrincipalAuthorized(state().threadId, principal)).toBe(true);
    expect(
      manager.isPrincipalAuthorized(state().threadId, {
        ownerKind: "session",
        ownerId: "foreign-session",
      }),
    ).toBe(false);
  });
});

describe("browser frame generation fence", () => {
  const frame = (): BrowserFrameHeader => ({
    desktopInstanceId: desktopInstanceId as BrowserFrameHeader["desktopInstanceId"],
    threadId: state().threadId,
    tabId: tabId as BrowserFrameHeader["tabId"],
    generation: 1 as BrowserFrameHeader["generation"],
    seq: 0 as BrowserFrameHeader["seq"],
    jpegW: 1280,
    jpegH: 720,
    deviceWidth: 1280,
    deviceHeight: 720,
    pageScaleFactor: 1,
    offsetTop: 0,
    scrollOffsetX: 0,
    scrollOffsetY: 0,
    timestamp: 1,
    captureTs: 2,
  });

  it("drops foreign desktop and generation frames", () => {
    expect(browserFrameMatchesState(frame(), state(), desktopInstanceId)).toBe(true);
    expect(
      browserFrameMatchesState(
        { ...frame(), generation: 2 as BrowserFrameHeader["generation"] },
        state(),
        desktopInstanceId,
      ),
    ).toBe(false);
    expect(browserFrameMatchesState(frame(), state(), "foreign-desktop")).toBe(false);
  });

  it("invalidates stored frame identity before desktop resync", async () => {
    let closeConnection: ((error: Error) => void) | undefined;
    const connection: BrowserHostControlConnection = {
      ...createConnection(),
      subscribeClose: (listener) => {
        closeConnection = listener;
        return () => undefined;
      },
    };
    const manager = new BrowserPaneManager({}, { connectControl: async () => connection });
    const events: string[] = [];
    manager.subscribeState(state().threadId, (event) => events.push(event.type));
    await manager.subscribeViewer(1, principal, {
      threadId: state().threadId,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    });
    closeConnection?.(new Error("desktop restarted"));
    expect(events).toEqual(["browser.state.invalidated"]);
    expect(manager.getState(state().threadId).stream).toMatchObject({
      lifecycle: "detached",
      identity: null,
      generationReason: "desktop-restart",
    });
  });
});
