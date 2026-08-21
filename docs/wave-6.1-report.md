# Wave 6.1 — Browser-pane remote-frame protocol

## Scope

Implemented on `luminor/wave6.1-browser-pane-protocol` in the isolated
`/tmp/wave61-worktree` checkout. The wave adds the browser-pane protocol,
desktop OSR acquisition and input bridge, server authorization/fan-out, and the
shared binary transport required by the next GPUI wave. It does not add the
Rust client, IME, drag-and-drop, multi-viewer input, or popup-affordance UI.

The running desktop development checkout was not edited, restarted, or stopped.

## What was built

### Contracts

`packages/contracts/src/browserPane.ts` is the schema-only protocol surface.
It defines frame identity and CDP metadata, lifecycle and generation reasons,
thread browser snapshots and stream events, browser controls, CDP-shaped input,
typed input rejections, controller leases, viewer principals, and both desktop
pipe handshakes. `packages/contracts/src/rpc.ts` registers the public Effect
RPCs as `WsBrowserPaneRpcGroup`.

`packages/contracts/src/device.ts` now declares a discriminated
`BinaryFrameEnvelopeHeader` with `device` and `browser` payload types. The
existing device frame wire constants remain available.

### Shared runtime

- `packages/shared/src/frameEnvelope.ts` validates and encodes the shared
  browser/device binary envelope and its desktop-pipe length prefix.
- `packages/shared/src/frameTransport.ts` owns principal-retaining subscriber
  state, bounded queues, replace-latest and drop-until-keyframe policies, and
  asynchronous socket backpressure.
- `packages/shared/src/browserStreamLifecycle.ts` owns the explicit
  stopped/starting/streaming/stopping/detached transition system and generation
  invalidation data.
- `apps/server/src/device/deviceFrameTransport.ts` now delegates its queue and
  subscriber mechanics to the shared transport instead of retaining a second
  implementation.

All three shared utilities have explicit `@luminor/shared` subpath exports.

### Desktop

- `browserAutomation/cdpRuntime.ts` owns the sole underlying debugger attach,
  detach, message listener, detach listener, and session identity. Dialogs,
  diagnostics, navigation, drag interception, window-open tracking, and remote
  input subscribe or dispatch through the coordinator.
- `browserManager.ts` makes runtime placement explicit. A viewed remote thread
  uses a hidden offscreen `BrowserWindow`; the Electron renderer retains the
  attached `WebContentsView` path. Placement changes rebuild the runtime in the
  existing `persist:luminor-browser` partition.
- `browserFrame/acquisition.ts` captures OSR paint frames, keeps one pending
  bitmap, JPEG-encodes on `browserFrame/jpegWorker.ts`, samples CDP layout
  metadata, applies the requested device metrics, caps the target at 30 fps,
  and forces a paint after every acquisition start.
- `offscreenGuestPreload.ts` composes the annotation preload with the DOM select
  shim. Offscreen window-open requests become Luminor tabs, JavaScript dialogs
  are handled through the existing dialog policy, and native file/color/date
  input activation is denied in the offscreen guest.
- `browserFrame/controller.ts` owns thread subscriptions, lifecycle and
  generation transitions, invalidation-before-state ordering, detach recovery,
  exact input fencing, same-frame mousemove coalescing, and CDP `Input.*`
  dispatch. Human click/key/insertText calls `markHumanControl` before dispatch.
- `browserFrame/framePipeServer.ts` is the dedicated desktop-to-server frame
  pipe with a timing-safe capability handshake, length-prefixed frames, and one
  replace-latest slot per backpressured pipe client.
- `browserUsePipeServer.ts` keeps tool calls on the existing request/response
  pipe while adding `browserControl` requests and `browserState` notifications.
  One connection may own multiple thread subscriptions, and disconnect releases
  every desktop subscription.

The desktop build emits `offscreenGuestPreload.js` and
`browserFrame/jpegWorker.js`. Sharp and its platform packages are staged outside
ASAR with the other native desktop dependencies.

### Server

- `browserPane/browserPaneManager.ts` retains each viewer principal, serializes
  per-thread subscription changes, shares one desktop subscription among
  viewers, owns the single controller lease, filters foreign frames, fans out
  state, invalidates cached identities on desktop loss, and resubscribes after
  restart.
- `browserPane/browserFrameIngress.ts` connects only to the private desktop
  frame pipe and rejects malformed handshakes/envelopes.
- `browserPane/browserFrameTransport.ts` uses the shared replace-latest
  transport with depth 1 per browser-frame WebSocket subscriber.
- `browserPane/browserFrameRoute.ts` exposes an uncompressed frame WebSocket on
  the existing server port. Admission requires loopback or an authenticated
  session token, a retained principal, and an active authorized subscription
  for the requested thread.
- `browserAutomation/browserHostRpcClient.ts` now supports persistent correlated
  requests, state notifications, and close notification on the existing tool
  pipe.
- `wsRpc.ts` merges the browser Effect RPC group, verifies the thread on initial
  subscription, binds control/input to viewer and lease state, and mounts the
  browser frame route next to the existing device frame route.

Lease and subscription changes use the existing structured Effect logging
conventions.

## Research §4 requirement map

| Requirement                  | Implementation                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §4.1 acquisition             | Path B is a hidden OSR `BrowserWindow`, 30 fps, BGRA paint copy, depth-1 worker queue, off-callback Sharp JPEG, shared session partition, select shim, dialog suppression, and offscreen popup-to-tab conversion.                                                                                                                                |
| §4.2 identity and lifecycle  | Every frame carries desktop/thread/tab/generation/sequence, JPEG dimensions, the named CDP metadata, and `captureTs`. The shared lifecycle bumps on start, stop, resize/reconfigure, reattach, and tab changes. Old identity is emitted as invalidated before the replacement snapshot/delta. Acquisition forces a paint for the new generation. |
| §4.3 viewport ownership      | The first thread subscriber owns `BrowserViewport`. The desktop changes OSR content bounds and applies `Emulation.setDeviceMetricsOverride` before starting the new generation. Additional viewers share that viewport and remain read-only.                                                                                                     |
| §4.4 transport               | Device and browser fan-out share `BinaryFrameTransport` and `makeBinaryFrameSink`. Browser JPEGs use `BinaryFrameEnvelopeHeader`, a dedicated capability-protected local pipe, an uncompressed authenticated WebSocket, and replace-latest storage at the worker, pipe, and per-subscriber boundaries.                                           |
| §4.5 control plane           | `ThreadBrowserStateSnapshot` bootstrap, invalidation, snapshot, and delta events flow desktop → server → subscribed Effect RPC stream. Navigate/history/reload/tab/focus/resize requests stay on `browserControl`; desktop reconnect performs resubscribe and a `desktop-restart` snapshot.                                                      |
| §4.6 authorization and lease | The server retains `BrowserViewerPrincipal`, checks thread existence and active principal subscription, grants one `BrowserControllerLease` per thread browser, rejects a second controller, keeps viewers read-only, and releases the lease/subscription on disconnect. Frames never carry input.                                               |
| §4.7 input and provenance    | `BrowserInputDispatchRequest` includes `origin` and the displayed frame identity. Server lease checks precede desktop validation of desktop/thread/tab/generation/sequence. Dispatch uses only CDP mouse/key/insertText methods. Human click/key/insertText marks human control; concurrent moves for one displayed sequence share one dispatch. |

## Test coverage

The new and adapted Vitest coverage includes:

- schema decode/rejection for frame, state, input, lease, and pipe contracts;
- lifecycle start/stop, zero subscribers, rapid tab changes, thread closure,
  detach/reattach, desktop restart, and server restart;
- debugger replacement, stale session identity, and a late command result after
  target destruction;
- foreign desktop/generation frame drops, stale generation/sequence input, and
  identity invalidation before restart resync;
- one desktop subscription for concurrent viewers, second-controller refusal,
  disconnect release, viewer read-only behavior, and retained-principal checks;
- slow-subscriber replace-latest behavior, async sink backpressure, device
  keyframe behavior, and private frame-pipe handshake/framing;
- multi-thread control-pipe ownership and subscription release on disconnect;
- loopback token admission, missing-token refusal, authenticated principal
  retention, and unauthorized frame subscription refusal;
- native dependency ASAR staging and all existing desktop automation regressions.

Path B does not use `Page.startScreencast`, `screencastFrameAck`, or CDP
`sessionId` frame acknowledgements. The required stale-ack race is therefore
covered at the shared debugger boundary: a result tied to a destroyed or
replaced coordinator session is rejected and cannot become a frame or input
success.

## Repository gate reconciliations

The full monorepo gate exposed existing tests and paths that had drifted from
current code. The final branch also:

- retains shell and thread subscription intent before an initial WebSocket
  client becomes available, without force-restarting a stream already restored
  during connection recovery;
- removes obsolete AppSnap expectations from the current app-settings schema
  tests;
- updates remaining Synara test fixtures to their Luminor environment keys and
  payload marker, makes diagnostics retention tests independent of wall-clock
  age, and aligns Claude adapter expectations with the resolved 1M Opus model
  capacity;
- makes generated Git patches use stable `a/` and `b/` prefixes and makes
  fast-forward pulls independent of a user's global rebase preference;
- preserves typed PTY spawn errors through the current Effect `Result` API so
  retryable shell failures reach the fallback candidates; and
- awaits the now-asynchronous device frame sink in its write-failure test so a
  rejected socket write cannot escape as an unhandled rejection.

## Exact GPUI consumption surface

The Rust client should generate or bind the schemas exported from
`@luminor/contracts/browserPane` through the package root:

- frame: `BrowserGeneration`, `BrowserFrameSequence`, `BrowserFrameMetadata`,
  `BrowserFrameHeader`, `BrowserFrameEnvelopeHeader`,
  `BinaryFrameEnvelopeHeader`;
- state: `BrowserStreamLifecycleState`, `BrowserGenerationBumpReason`,
  `BrowserStreamIdentity`, `BrowserStreamStatus`, `BrowserTabStateSnapshot`,
  `ThreadBrowserStateSnapshot`, `BrowserStateStreamEvent`;
- subscription: `BrowserStreamSubscribeInput`, `BrowserStreamSubscribeResult`,
  `BrowserStreamUnsubscribeInput`, `BrowserStreamUnsubscribeResult`,
  `BrowserSubscriptionStreamItem`;
- control: `BrowserStateSnapshotInput`, `BrowserStateSnapshotResult`,
  `BrowserNavigateRequest`, `BrowserTabControlRequest`,
  `BrowserTabCreateRequest`, `BrowserFocusRequest`,
  `BrowserViewportResizeRequest`, `BrowserControlResult`;
- input: `BrowserInputOrigin`, `BrowserMouseInputEvent`,
  `BrowserWheelInputEvent`, `BrowserKeyInputEvent`,
  `BrowserInsertTextInputEvent`, `BrowserInputDispatchRequest`,
  `BrowserInputRejectionReason`, `BrowserInputDispatchResult`;
- lease/auth: `BrowserControllerLease`, `BrowserControllerAcquireRequest`,
  `BrowserControllerAcquireResult`, `BrowserControllerReleaseRequest`,
  `BrowserControllerRevokeRequest`, `BrowserControllerLeaseChangeResult`,
  `BrowserViewerPrincipal`, `BrowserViewerAuthorization`.

Public Effect RPC method identifiers are:

```text
browser.subscribe
browser.unsubscribe
browser.getState
browser.navigate
browser.goBack
browser.goForward
browser.reload
browser.tab.create
browser.tab.select
browser.tab.close
browser.focus
browser.viewport.resize
browser.input.dispatch
browser.controller.acquire
browser.controller.release
browser.controller.revoke
```

`browser.subscribe` is the state stream. Its first item is
`browser.subscription.ready`; subsequent items are
`browser.state.invalidated`, `browser.state.snapshot`, or
`browser.state.delta`.

The frame channel is:

```text
GET /ws/browser-frames?threadId=<ThreadId>
```

It uses the same session credential as the feature WebSocket and sends one
uncompressed binary message per JPEG. A message is the shared envelope directly
(there is no outer length prefix on WebSocket): little-endian `u32` magic
`0x4c554d46`, `u8` version `1`, `u8` payload-type code `2`, little-endian `u32`
JSON-header length, little-endian `u32` JPEG length, UTF-8
`BrowserFrameEnvelopeHeader` JSON, then JPEG bytes. The GPUI client must drop a
frame unless its desktop/thread/tab/generation matches the most recent state
identity and must echo that displayed frame's generation and sequence in input.

The internal desktop channels, useful for diagnostics but not consumed by
GPUI, are `browserControl`, `browserState`, and pipe protocol
`luminor-browser-frame-v1`.

## Known gaps and deliberate deviations

- No live Electron process was launched from the worktree because the task
  explicitly prohibited restarting or interfering with the running desktop.
  The desktop bundle and JPEG worker are exercised without launching the app;
  live OSR physics remain the evidence recorded by the Wave 6.0 spike.
- The device WebSocket retains its established H.264 binary wire layout so the
  current device client is not broken. Device and browser paths share queue,
  backpressure, sink, and subscriber mechanics; the new generic JSON-header
  envelope is used by browser JPEGs. Migrating the existing device wire would
  require a coordinated client protocol version.
- Additional viewers do not negotiate a second viewport. The first subscriber
  owns layout; Wave 6.2 must letterbox other viewers against the frame metadata.
- Popup-affordance UI, GPUI rendering/coordinate transforms, cursor overlay,
  IME, drag-and-drop, and multi-viewer input are intentionally deferred by the
  Wave 6.1 boundary.

## Verification

The final repository gate pass completed with:

```text
bun fmt       PASS — oxfmt completed on 2,791 files
bun lint      PASS — 456 warnings, 0 errors
bun typecheck PASS — 7 successful tasks out of 7
bun run test  PASS — 8 successful tasks out of 8
```

Vitest totals were 887 passing test files and 9,827 passing tests, with four
test files and 24 tests skipped. Package totals were:

| Package              | Test files            | Tests                    |
| -------------------- | --------------------- | ------------------------ |
| `@luminor/scripts`   | 14 passed             | 88 passed                |
| `@luminor/contracts` | 19 passed             | 216 passed               |
| `@luminor/shared`    | 66 passed             | 604 passed, 1 skipped    |
| `@luminor/desktop`   | 73 passed, 1 skipped  | 629 passed, 5 skipped    |
| `@luminor/web`       | 349 passed            | 4,277 passed             |
| `@luminor/cli`       | 366 passed, 3 skipped | 4,013 passed, 18 skipped |
