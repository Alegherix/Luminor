import { Schema } from "effect";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas";
import { BrowserDesktopInstanceId, BrowserTabId } from "./browserAutomationIds";
import { BrowserViewport } from "./browserAutomationToolOutputs";

const BrowserIdentifier = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const BrowserUrl = Schema.String.check(Schema.isMaxLength(16_384));
const BrowserText = Schema.String.check(Schema.isMaxLength(65_536));
const BrowserCoordinate = Schema.Finite;
const BrowserDimension = Schema.Finite.check(Schema.isGreaterThan(0));

export const BROWSER_PANE_WS_METHODS = {
  subscribe: "browser.subscribe",
  unsubscribe: "browser.unsubscribe",
  getState: "browser.getState",
  navigate: "browser.navigate",
  goBack: "browser.goBack",
  goForward: "browser.goForward",
  reload: "browser.reload",
  createTab: "browser.tab.create",
  selectTab: "browser.tab.select",
  closeTab: "browser.tab.close",
  focus: "browser.focus",
  resizeViewport: "browser.viewport.resize",
  dispatchInput: "browser.input.dispatch",
  acquireController: "browser.controller.acquire",
  releaseController: "browser.controller.release",
  revokeController: "browser.controller.revoke",
} as const;

export const BROWSER_PANE_WS_CHANNELS = {
  state: "browser.state",
  frame: "browser.frame",
} as const;

export const BROWSER_FRAME_WS_PATH = "/ws/browser-frames";
export const BROWSER_FRAME_WS_THREAD_ID_PARAM = "threadId";
export const BROWSER_FRAME_PIPE_PROTOCOL = "luminor-browser-frame-v1";
export const BROWSER_HOST_CONTROL_METHOD = "browserControl";
export const BROWSER_HOST_STATE_METHOD = "browserState";

export const BrowserGeneration = PositiveInt.pipe(Schema.brand("BrowserGeneration"));
export type BrowserGeneration = typeof BrowserGeneration.Type;

export const BrowserFrameSequence = NonNegativeInt.pipe(Schema.brand("BrowserFrameSequence"));
export type BrowserFrameSequence = typeof BrowserFrameSequence.Type;

export const BrowserFrameMetadata = Schema.Struct({
  deviceWidth: BrowserDimension,
  deviceHeight: BrowserDimension,
  pageScaleFactor: BrowserDimension,
  offsetTop: BrowserCoordinate,
  scrollOffsetX: BrowserCoordinate,
  scrollOffsetY: BrowserCoordinate,
  timestamp: Schema.Finite,
});
export type BrowserFrameMetadata = typeof BrowserFrameMetadata.Type;

export const BrowserFrameHeader = Schema.Struct({
  desktopInstanceId: BrowserDesktopInstanceId,
  threadId: ThreadId,
  tabId: BrowserTabId,
  generation: BrowserGeneration,
  seq: BrowserFrameSequence,
  jpegW: PositiveInt,
  jpegH: PositiveInt,
  deviceWidth: BrowserDimension,
  deviceHeight: BrowserDimension,
  pageScaleFactor: BrowserDimension,
  offsetTop: BrowserCoordinate,
  scrollOffsetX: BrowserCoordinate,
  scrollOffsetY: BrowserCoordinate,
  timestamp: Schema.Finite,
  captureTs: Schema.Finite,
});
export type BrowserFrameHeader = typeof BrowserFrameHeader.Type;

export const BrowserStreamLifecycleState = Schema.Literals([
  "stopped",
  "starting",
  "streaming",
  "stopping",
  "detached",
]);
export type BrowserStreamLifecycleState = typeof BrowserStreamLifecycleState.Type;

export const BrowserGenerationBumpReason = Schema.Literals([
  "start",
  "stop",
  "reconfigure",
  "resize",
  "reattach",
  "tab-switch",
  "thread-switch",
  "desktop-restart",
]);
export type BrowserGenerationBumpReason = typeof BrowserGenerationBumpReason.Type;

export const BrowserStreamIdentity = Schema.Struct({
  desktopInstanceId: BrowserDesktopInstanceId,
  threadId: ThreadId,
  tabId: BrowserTabId,
  generation: BrowserGeneration,
});
export type BrowserStreamIdentity = typeof BrowserStreamIdentity.Type;

export const BrowserStreamStatus = Schema.Struct({
  lifecycle: BrowserStreamLifecycleState,
  identity: Schema.NullOr(BrowserStreamIdentity),
  generationReason: Schema.NullOr(BrowserGenerationBumpReason),
  viewport: BrowserViewport,
  subscriberCount: NonNegativeInt,
});
export type BrowserStreamStatus = typeof BrowserStreamStatus.Type;

export const BrowserTabStateSnapshot = Schema.Struct({
  id: BrowserTabId,
  url: BrowserUrl,
  title: Schema.String.check(Schema.isMaxLength(4_096)),
  runtimeSurface: Schema.optional(Schema.Literals(["native", "renderer"])),
  status: Schema.Literals(["live", "suspended"]),
  isLoading: Schema.Boolean,
  canGoBack: Schema.Boolean,
  canGoForward: Schema.Boolean,
  faviconUrl: Schema.NullOr(BrowserUrl),
  lastCommittedUrl: Schema.NullOr(BrowserUrl),
  lastError: Schema.NullOr(Schema.String.check(Schema.isMaxLength(4_096))),
});
export type BrowserTabStateSnapshot = typeof BrowserTabStateSnapshot.Type;

export const ThreadBrowserStateSnapshot = Schema.Struct({
  threadId: ThreadId,
  version: NonNegativeInt,
  open: Schema.Boolean,
  activeTabId: Schema.NullOr(BrowserTabId),
  tabs: Schema.Array(BrowserTabStateSnapshot).check(Schema.isMaxLength(128)),
  lastError: Schema.NullOr(Schema.String.check(Schema.isMaxLength(4_096))),
  stream: BrowserStreamStatus,
});
export type ThreadBrowserStateSnapshot = typeof ThreadBrowserStateSnapshot.Type;

export const BrowserStreamSubscribeInput = Schema.Struct({
  threadId: ThreadId,
  viewport: BrowserViewport,
});
export type BrowserStreamSubscribeInput = typeof BrowserStreamSubscribeInput.Type;

export const BrowserStreamSubscribeResult = Schema.Struct({
  subscriptionId: BrowserIdentifier,
  state: ThreadBrowserStateSnapshot,
  authorization: Schema.Literal("viewer"),
});
export type BrowserStreamSubscribeResult = typeof BrowserStreamSubscribeResult.Type;

export const BrowserStreamUnsubscribeInput = Schema.Struct({
  threadId: ThreadId,
  subscriptionId: BrowserIdentifier,
});
export type BrowserStreamUnsubscribeInput = typeof BrowserStreamUnsubscribeInput.Type;

export const BrowserStreamUnsubscribeResult = Schema.Struct({
  released: Schema.Boolean,
});
export type BrowserStreamUnsubscribeResult = typeof BrowserStreamUnsubscribeResult.Type;

export const BrowserStateSnapshotInput = Schema.Struct({
  threadId: ThreadId,
});
export type BrowserStateSnapshotInput = typeof BrowserStateSnapshotInput.Type;

export const BrowserStateSnapshotResult = Schema.Struct({
  state: ThreadBrowserStateSnapshot,
});
export type BrowserStateSnapshotResult = typeof BrowserStateSnapshotResult.Type;

export const BrowserStateStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("browser.state.invalidated"),
    threadId: ThreadId,
    previousDesktopInstanceId: Schema.NullOr(BrowserDesktopInstanceId),
    previousGeneration: Schema.NullOr(BrowserGeneration),
    reason: BrowserGenerationBumpReason,
  }),
  Schema.Struct({
    type: Schema.Literal("browser.state.snapshot"),
    state: ThreadBrowserStateSnapshot,
    reason: Schema.Literals(["bootstrap", "resync", "desktop-restart"]),
  }),
  Schema.Struct({
    type: Schema.Literal("browser.state.delta"),
    state: ThreadBrowserStateSnapshot,
  }),
]);
export type BrowserStateStreamEvent = typeof BrowserStateStreamEvent.Type;

export const BrowserSubscriptionStreamItem = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("browser.subscription.ready"),
    subscription: BrowserStreamSubscribeResult,
  }),
  BrowserStateStreamEvent,
]);
export type BrowserSubscriptionStreamItem = typeof BrowserSubscriptionStreamItem.Type;

const BrowserGenerationFence = {
  threadId: ThreadId,
  expectedGeneration: BrowserGeneration,
};

export const BrowserNavigateRequest = Schema.Struct({
  ...BrowserGenerationFence,
  tabId: BrowserTabId,
  url: BrowserUrl,
});
export type BrowserNavigateRequest = typeof BrowserNavigateRequest.Type;

export const BrowserTabControlRequest = Schema.Struct({
  ...BrowserGenerationFence,
  tabId: BrowserTabId,
});
export type BrowserTabControlRequest = typeof BrowserTabControlRequest.Type;

export const BrowserTabCreateRequest = Schema.Struct({
  ...BrowserGenerationFence,
  url: Schema.optional(BrowserUrl),
  activate: Schema.optional(Schema.Boolean),
});
export type BrowserTabCreateRequest = typeof BrowserTabCreateRequest.Type;

export const BrowserFocusRequest = Schema.Struct({
  ...BrowserGenerationFence,
  focused: Schema.Boolean,
});
export type BrowserFocusRequest = typeof BrowserFocusRequest.Type;

export const BrowserViewportResizeRequest = Schema.Struct({
  ...BrowserGenerationFence,
  viewport: BrowserViewport,
});
export type BrowserViewportResizeRequest = typeof BrowserViewportResizeRequest.Type;

export const BrowserControlResult = Schema.Struct({
  state: ThreadBrowserStateSnapshot,
});
export type BrowserControlResult = typeof BrowserControlResult.Type;

export const BrowserInputOrigin = Schema.Literals(["human", "agent"]);
export type BrowserInputOrigin = typeof BrowserInputOrigin.Type;

export const BrowserMouseButton = Schema.Literals([
  "none",
  "left",
  "middle",
  "right",
  "back",
  "forward",
]);
export type BrowserMouseButton = typeof BrowserMouseButton.Type;

export const BrowserMouseInputEvent = Schema.Struct({
  kind: Schema.Literal("mouse"),
  type: Schema.Literals(["mousePressed", "mouseReleased", "mouseMoved"]),
  x: BrowserCoordinate,
  y: BrowserCoordinate,
  button: Schema.optional(BrowserMouseButton),
  buttons: Schema.optional(NonNegativeInt),
  clickCount: Schema.optional(NonNegativeInt),
  modifiers: Schema.optional(NonNegativeInt),
});
export type BrowserMouseInputEvent = typeof BrowserMouseInputEvent.Type;

export const BrowserWheelInputEvent = Schema.Struct({
  kind: Schema.Literal("wheel"),
  type: Schema.Literal("mouseWheel"),
  x: BrowserCoordinate,
  y: BrowserCoordinate,
  deltaX: Schema.Finite,
  deltaY: Schema.Finite,
  modifiers: Schema.optional(NonNegativeInt),
});
export type BrowserWheelInputEvent = typeof BrowserWheelInputEvent.Type;

export const BrowserKeyInputEvent = Schema.Struct({
  kind: Schema.Literal("key"),
  type: Schema.Literals(["keyDown", "keyUp", "rawKeyDown", "char"]),
  key: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  code: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  text: Schema.optional(BrowserText),
  unmodifiedText: Schema.optional(BrowserText),
  windowsVirtualKeyCode: Schema.optional(NonNegativeInt),
  nativeVirtualKeyCode: Schema.optional(NonNegativeInt),
  modifiers: Schema.optional(NonNegativeInt),
  autoRepeat: Schema.optional(Schema.Boolean),
  isKeypad: Schema.optional(Schema.Boolean),
  isSystemKey: Schema.optional(Schema.Boolean),
  location: Schema.optional(NonNegativeInt),
  commands: Schema.optional(
    Schema.Array(Schema.String.check(Schema.isMaxLength(256))).check(Schema.isMaxLength(32)),
  ),
});
export type BrowserKeyInputEvent = typeof BrowserKeyInputEvent.Type;

export const BrowserInsertTextInputEvent = Schema.Struct({
  kind: Schema.Literal("insertText"),
  text: BrowserText,
});
export type BrowserInsertTextInputEvent = typeof BrowserInsertTextInputEvent.Type;

export const BrowserInputEvent = Schema.Union([
  BrowserMouseInputEvent,
  BrowserWheelInputEvent,
  BrowserKeyInputEvent,
  BrowserInsertTextInputEvent,
]);
export type BrowserInputEvent = typeof BrowserInputEvent.Type;

export const BrowserInputDispatchRequest = Schema.Struct({
  desktopInstanceId: BrowserDesktopInstanceId,
  threadId: ThreadId,
  tabId: BrowserTabId,
  generation: BrowserGeneration,
  seq: BrowserFrameSequence,
  origin: BrowserInputOrigin,
  event: BrowserInputEvent,
});
export type BrowserInputDispatchRequest = typeof BrowserInputDispatchRequest.Type;

export const BrowserInputRejectionReason = Schema.Literals([
  "stale-generation",
  "stale-frame",
  "wrong-desktop",
  "wrong-thread",
  "wrong-tab",
  "target-detached",
  "controller-required",
  "viewer-read-only",
  "invalid-event",
]);
export type BrowserInputRejectionReason = typeof BrowserInputRejectionReason.Type;

export const BrowserInputDispatchResult = Schema.Union([
  Schema.Struct({
    accepted: Schema.Literal(true),
    generation: BrowserGeneration,
    seq: BrowserFrameSequence,
  }),
  Schema.Struct({
    accepted: Schema.Literal(false),
    reason: BrowserInputRejectionReason,
    currentDesktopInstanceId: Schema.NullOr(BrowserDesktopInstanceId),
    currentTabId: Schema.NullOr(BrowserTabId),
    currentGeneration: Schema.NullOr(BrowserGeneration),
    currentSeq: Schema.NullOr(BrowserFrameSequence),
  }),
]);
export type BrowserInputDispatchResult = typeof BrowserInputDispatchResult.Type;

export const BrowserControllerLease = Schema.Struct({
  leaseId: BrowserIdentifier,
  threadId: ThreadId,
  controllerId: BrowserIdentifier,
  acquiredAt: IsoDateTime,
});
export type BrowserControllerLease = typeof BrowserControllerLease.Type;

export const BrowserControllerAcquireRequest = Schema.Struct({
  threadId: ThreadId,
});
export type BrowserControllerAcquireRequest = typeof BrowserControllerAcquireRequest.Type;

export const BrowserControllerAcquireResult = Schema.Union([
  Schema.Struct({ granted: Schema.Literal(true), lease: BrowserControllerLease }),
  Schema.Struct({
    granted: Schema.Literal(false),
    reason: Schema.Literal("controller-unavailable"),
  }),
]);
export type BrowserControllerAcquireResult = typeof BrowserControllerAcquireResult.Type;

export const BrowserControllerReleaseRequest = Schema.Struct({
  threadId: ThreadId,
  leaseId: BrowserIdentifier,
});
export type BrowserControllerReleaseRequest = typeof BrowserControllerReleaseRequest.Type;

export const BrowserControllerRevokeRequest = Schema.Struct({
  threadId: ThreadId,
  leaseId: Schema.optional(BrowserIdentifier),
});
export type BrowserControllerRevokeRequest = typeof BrowserControllerRevokeRequest.Type;

export const BrowserControllerLeaseChangeResult = Schema.Struct({
  released: Schema.Boolean,
});
export type BrowserControllerLeaseChangeResult = typeof BrowserControllerLeaseChangeResult.Type;

export const BrowserViewerPrincipal = Schema.Struct({
  ownerKind: Schema.Literals(["session", "local-loopback"]),
  ownerId: BrowserIdentifier,
});
export type BrowserViewerPrincipal = typeof BrowserViewerPrincipal.Type;

export const BrowserViewerAuthorization = Schema.Struct({
  threadId: ThreadId,
  principal: BrowserViewerPrincipal,
  role: Schema.Literals(["controller", "viewer"]),
  authorized: Schema.Boolean,
});
export type BrowserViewerAuthorization = typeof BrowserViewerAuthorization.Type;

export const BrowserDesktopControlRequest = Schema.Union([
  Schema.Struct({ type: Schema.Literal("subscribe"), input: BrowserStreamSubscribeInput }),
  Schema.Struct({ type: Schema.Literal("unsubscribe"), input: BrowserStreamUnsubscribeInput }),
  Schema.Struct({ type: Schema.Literal("getState"), input: BrowserStateSnapshotInput }),
  Schema.Struct({ type: Schema.Literal("navigate"), input: BrowserNavigateRequest }),
  Schema.Struct({ type: Schema.Literal("goBack"), input: BrowserTabControlRequest }),
  Schema.Struct({ type: Schema.Literal("goForward"), input: BrowserTabControlRequest }),
  Schema.Struct({ type: Schema.Literal("reload"), input: BrowserTabControlRequest }),
  Schema.Struct({ type: Schema.Literal("createTab"), input: BrowserTabCreateRequest }),
  Schema.Struct({ type: Schema.Literal("selectTab"), input: BrowserTabControlRequest }),
  Schema.Struct({ type: Schema.Literal("closeTab"), input: BrowserTabControlRequest }),
  Schema.Struct({ type: Schema.Literal("focus"), input: BrowserFocusRequest }),
  Schema.Struct({ type: Schema.Literal("resizeViewport"), input: BrowserViewportResizeRequest }),
  Schema.Struct({ type: Schema.Literal("dispatchInput"), input: BrowserInputDispatchRequest }),
]);
export type BrowserDesktopControlRequest = typeof BrowserDesktopControlRequest.Type;

export const BrowserDesktopControlResponse = Schema.Union([
  Schema.Struct({ type: Schema.Literal("subscribed"), result: BrowserStreamSubscribeResult }),
  Schema.Struct({ type: Schema.Literal("unsubscribed"), result: BrowserStreamUnsubscribeResult }),
  Schema.Struct({ type: Schema.Literal("state"), result: BrowserStateSnapshotResult }),
  Schema.Struct({ type: Schema.Literal("controlled"), result: BrowserControlResult }),
  Schema.Struct({ type: Schema.Literal("input"), result: BrowserInputDispatchResult }),
]);
export type BrowserDesktopControlResponse = typeof BrowserDesktopControlResponse.Type;

export const BrowserFramePipeHandshake = Schema.Struct({
  protocol: Schema.Literal(BROWSER_FRAME_PIPE_PROTOCOL),
  capability: BrowserIdentifier,
});
export type BrowserFramePipeHandshake = typeof BrowserFramePipeHandshake.Type;

export const BrowserFramePipeHandshakeResult = Schema.Struct({
  accepted: Schema.Boolean,
  desktopInstanceId: Schema.NullOr(BrowserDesktopInstanceId),
});
export type BrowserFramePipeHandshakeResult = typeof BrowserFramePipeHandshakeResult.Type;
