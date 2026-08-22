# Wave 6.4 batch B: scoped dialogs and blocking surfaces

## Outcome

Browser-pane JavaScript dialogs are now intercepted for the lifetime of the offscreen runtime but
are auto-answered only inside an agent turn's `withDialogHandling` scope. Outside that scope the
dialog remains blocked in Chromium and is published in `ThreadBrowserStateSnapshot.blocking`.

The existing `browser.state.delta` path carries blocking state to every viewer. The batch adds the
generation-fenced `browser.desktopWindow.reveal` and `browser.blocking.resolve` RPCs, reports
swallowed native inputs, reports denied permission prompts, and records popup-to-tab provenance.
No new stream event was introduced.

## File map

| Area                | Files                                                                                                                                                                           | Purpose                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Contracts           | `packages/contracts/src/browserPane.ts`, `packages/contracts/src/rpc.ts`, `packages/contracts/src/ipc.ts`                                                                       | Blocking-surface snapshot schema, popup provenance, request/result types, Effect RPC declarations, and desktop pipe unions  |
| Contract tests      | `packages/contracts/src/browserPane.test.ts`                                                                                                                                    | Bounds, snapshot, reveal, and tagged-resolution validation                                                                  |
| Dialog interception | `apps/desktop/src/browserAutomation/dialogHandling.ts`, `dialogHandling.test.ts`                                                                                                | Persistent CDP observation, turn-scoped answer policy, out-of-turn reporting, and caller-supplied resolution                |
| Blocking lifecycle  | `apps/desktop/src/browserFrame/acquisition.ts`, `controller.ts`, `controller.test.ts`                                                                                           | Runtime event ingestion, bounded state, clear rules, generation fencing, reveal/resolve handling, and per-tab summary flags |
| Native inputs       | `apps/desktop/src/browserOffscreen/nativeInputBlocking.ts`, `nativeInputBlocking.test.ts`, `selectShim.ts`, `apps/desktop/src/offscreenGuestPreload.ts`                         | Classify and report swallowed file/native widgets without weakening native-widget containment                               |
| Desktop integration | `apps/desktop/src/browserManager.ts`, `browserManagerAutomation.test.ts`, `main.ts`, `browserUsePipeServer.ts`                                                                  | `openerTabId`, permission-denial reporting, real-window focus result, and control-union pipe decode                         |
| Server routing      | `apps/server/src/browserPane/browserPaneManager.ts`, `browserPaneManager.test.ts`, `apps/server/src/wsRpc.ts`, `apps/server/src/browserAutomation/browserHostRpcClient.test.ts` | Lease gates, RPC forwarding, state caching/fan-out, generation invalidation, and response validation                        |

## Rust-client protocol surface

All JSON fields remain camelCase.

### Snapshot additions

`ThreadBrowserStateSnapshot` adds:

```text
blocking: BrowserBlockingSurface[] // maximum 8
```

`BrowserTabStateSnapshot` adds:

```text
hasBlockingSurface: boolean
openerTabId: BrowserTabId | null
```

`BrowserJavaScriptDialogKind` is the literal set `alert | confirm | prompt | beforeunload`.

`BrowserBlockingSurfaceKind` is the literal set:

```text
javascript-dialog | file-chooser | native-widget | permission-prompt |
auth-prompt | print-dialog | popup-window
```

`BrowserBlockingSurfaceResolutionKind` is `accepted | dismissed | denied`.

`BrowserBlockingSurface` has these exact fields:

| Field                | Type                                           | Meaning                                                    |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `id`                 | string                                         | Stable identifier used by the resolve RPC                  |
| `tabId`              | `BrowserTabId`                                 | Owning pane tab                                            |
| `kind`               | `BrowserBlockingSurfaceKind`                   | Surface category                                           |
| `dialogKind`         | `BrowserJavaScriptDialogKind \| null`          | JavaScript-dialog subtype                                  |
| `message`            | `string \| null`                               | JavaScript dialog message, maximum 4,096 characters        |
| `defaultPrompt`      | `string \| null`                               | JavaScript prompt default, maximum 4,096 characters        |
| `inputType`          | `string \| null`                               | Swallowed native input type, maximum 256 characters        |
| `permission`         | `string \| null`                               | Denied Electron permission name, maximum 256 characters    |
| `renderable`         | boolean                                        | Whether the surface itself is visible in the streamed JPEG |
| `remotelyAnswerable` | boolean                                        | Whether `browser.blocking.resolve` can settle it           |
| `autoResolution`     | `BrowserBlockingSurfaceResolutionKind \| null` | Resolution already applied by desktop policy               |
| `openedAt`           | ISO date-time string                           | Surface observation time                                   |

The currently produced values are:

| `kind`              | `renderable` | `remotelyAnswerable` | `autoResolution` | Producer                                                                       |
| ------------------- | ------------ | -------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `javascript-dialog` | false        | true                 | null             | CDP `Page.javascriptDialogOpening` outside an agent turn                       |
| `file-chooser`      | false        | false                | null             | offscreen shim swallowing `input[type=file]`                                   |
| `native-widget`     | false        | false                | null             | offscreen shim swallowing color/date/datetime-local/month/time/week inputs     |
| `permission-prompt` | false        | false                | `denied`         | browser-partition permission request handler                                   |
| `auth-prompt`       | false        | false                | null             | Contract arm; no desktop producer yet                                          |
| `print-dialog`      | false        | false                | null             | Contract arm; no desktop producer yet                                          |
| `popup-window`      | false        | false                | null             | Contract arm for attached placement; intentionally dead in offscreen placement |

The `<select>` replacement remains the only native chooser rendered inside the JPEG. It is handled
in-page and therefore does not create a blocking row.

### RPC additions

`BrowserDesktopWindowRevealReason` uses the same seven kebab-case values as
`BrowserBlockingSurfaceKind`.

```text
browser.desktopWindow.reveal
request: {
  threadId,
  expectedGeneration,
  reason: BrowserDesktopWindowRevealReason
}
result: {
  revealed: boolean,
  fallbackText: string
}
```

`revealed` is read from the existing `focusMainWindow()` path after restore/show/focus. A Wayland
compositor may refuse the raise, so clients must display `fallbackText` when it is false.

`BrowserBlockingSurfaceResolution` is tagged by `action`:

```text
{ action: "accept", promptText?: string } | { action: "dismiss" }
```

```text
browser.blocking.resolve
request: {
  threadId,
  expectedGeneration,
  surfaceId: string,
  resolution: BrowserBlockingSurfaceResolution
}
result: {
  state: ThreadBrowserStateSnapshot
}
```

Both methods require the caller to be an authorized viewer holding the thread's controller lease.
Resolution additionally rejects missing, detached, stale-generation, and non-remotely-answerable
surfaces. The accept arm forwards `promptText`, when present, to
`Page.handleJavaScriptDialog`.

## Dialog suppression semantics

- CDP `Page.enable` and dialog-opening/closed observation stay installed per `WebContents`; this is
  the unconditional containment layer required by offscreen Wayland operation.
- Outside `withDialogHandling`, no `Page.handleJavaScriptDialog` command is issued. The current
  dialog is reported and remains blocked until a controller resolves it, an agent turn starts, or
  Chromium closes it.
- Inside `withDialogHandling`, the existing safe policy is unchanged: alert accepts; confirm,
  prompt, and beforeunload dismiss. The main-world alert/confirm/prompt shim exists only for that
  turn and is restored during bounded cleanup.
- A dialog already open when an agent turn starts is dismissed before the operation, preserving
  the prior unblock-before-tool-call behavior without applying it during passive pane viewing.
- Dialog-closed clears only the JavaScript-dialog row. Main-frame navigation and tab close clear
  all rows for that tab. Stream stop, detach/recovery, reconfiguration, resize/tab-switch, desktop
  restart, and every generation invalidation clear generation-owned rows.
- Native-input reporting is best effort, but native widget suppression is not: a preload IPC
  failure still swallows the native chooser so it cannot reach the compositor.

## `window.opener` investigation

Electron documents renderer-created windows as native DOM `Window` objects paired with an
Electron `BrowserWindow`. Returning `action: "allow"` keeps that creation path while
`overrideBrowserWindowOptions` controls the backing window. `show: false` changes presentation,
and `webPreferences.offscreen: true` changes rendering; neither option is documented as replacing
the child target or severing its opener. Electron also documents that the child normally closes
with the opener unless `outlivesOpener` is enabled.

| Option                                                                                               | Preserves the browser-created child/opener relationship?                                                                 | Streaming approach                                                                                                                                     | Tradeoffs                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allow with `overrideBrowserWindowOptions: { show: false, webPreferences: { offscreen: true, ... } }` | Yes by design: Chromium creates the child and Electron wraps it instead of denying it                                    | Register `did-create-window`, retain the hidden `BrowserWindow`, attach the existing frame acquisition, and expose it as a pane tab with `openerTabId` | Best semantic fit; adds child lifetime, resource-budget, crash, navigation, and Wayland no-surface acceptance work                                                        |
| Allow with `createWindow(options)` returning a custom hidden/offscreen `WebContents`                 | Intended to preserve the same allowed child creation while replacing Electron's default `BrowserWindow` factory          | Create and register the offscreen host directly; `did-create-window` is not emitted                                                                    | More control, but more lifecycle/security responsibility and easier to diverge from Electron's inherited options; use only if the default allow path cannot be integrated |
| Temporarily switch the OAuth flow to attached placement                                              | Existing attached popup path preserves `window.opener`                                                                   | Keep the native popup and ask the user to continue there                                                                                               | Proven behavior but breaks pane continuity, can steal focus, complicates multi-viewer state, and does not provide a streamed popup tab                                    |
| `Target.setAutoAttach` / `Target.autoAttachRelated` plus `Page.windowOpen`                           | No. CDP can observe and attach to a child that already exists; it does not create or restore the DOM opener relationship | Useful as diagnostics or attachment plumbing after Electron has allowed the child                                                                      | `TargetInfo.openerId`, `canAccessOpener`, and `openerFrameId` can verify provenance; `Page.windowOpen` is only a pre-open event                                           |
| Current deny-and-convert-to-tab path                                                                 | No                                                                                                                       | Existing offscreen tab acquisition                                                                                                                     | Lowest implementation cost but silently breaks OAuth callbacks that `postMessage` to `window.opener`                                                                      |

Recommendation: in a dedicated follow-up, allow only popup-classified web URLs in offscreen
placement and override the child to `show: false`, `offscreen: true`, the browser partition, the
offscreen preload, and background throttling disabled. Keep `outlivesOpener` false, retain both
parent and child, register the child as a logical pane tab, and stream the child's own paint/CDP
session. Use CDP target metadata as an assertion, not as the mechanism that creates the
relationship. Fall back to the custom `createWindow` hook only if an Electron 40 spike shows the
default hidden child cannot be adopted cleanly.

The acceptance spike must prove an OAuth-shaped cross-origin child can call
`window.opener.postMessage`, that the parent receives it, that the child can close itself, and that
no native surface reaches Wayland. It must also cover opener close/crash, child navigation,
resource eviction, popup chains, and pages that explicitly request `noopener` or isolate
themselves with cross-origin opener policy.

Primary references:

- [Electron: Opening windows from the renderer](https://www.electronjs.org/docs/latest/api/window-open)
- [Electron: WindowOpenHandlerResponse](https://www.electronjs.org/docs/latest/api/structures/window-open-handler-response)
- [Electron: webContents offscreen paint](https://www.electronjs.org/docs/latest/api/web-contents/)
- [Chrome DevTools Protocol: Target domain](https://chromedevtools.github.io/devtools-protocol/tot/Target/)
- [Chrome DevTools Protocol: Page.windowOpen](https://chromedevtools.github.io/devtools-protocol/1-3/Page/#event-windowOpen)

## Review finding dispositions

1. **Interception ordering — fixed.** Every manager-owned `BrowserWindow` and
   `WebContentsView` now starts the persistent dialog monitor as soon as its WebContents exists.
   The resulting readiness promise is awaited before `loadTab` and the direct `about:blank`
   bootstrap. The ordering test covers both the first offscreen runtime and its recreated
   WebContents.
2. **Dialog identity confusion — fixed.** Monitor openings have stable internal identities.
   Resolution and agent-turn dismissal clear only the identity they answered, so a chained
   successor remains published.
3. **In-turn answer failure — fixed.** Benign already-closed responses retain the prior
   auto-answer semantics. Unexpected CDP rejection publishes the still-open dialog to observers
   and omits it from the command's handled-dialog result.
4. **Resolve versus already-closed dialog — fixed.** `No dialog is showing` is treated as a
   successful already-closed resolution, clears the matching observed dialog, and lets the
   controller remove the stale row without an RPC error.
5. **Navigation row lifetime — fixed.** Navigate, back, forward, and reload clear notify-only
   rows while retaining JavaScript-dialog rows until the monitor reports closure. Tab close still
   clears the full tab.
6. **Context-wipe force-clear — fixed.** Execution-context clears and main-frame navigation no
   longer clear the monitor. Only `Page.javascriptDialogClosed` and WebContents destruction clear
   its current dialog.
7. **Requested coverage gaps — closed.** Focused tests cover a pre-existing dialog at turn start,
   the max-eight append-then-slice rule, generation-bump re-observation, and end-to-end desktop
   `promptText` forwarding.
8. **Nits and schema drift — fixed.** The three requested explanatory comments were removed, and
   `BrowserDesktopWindowRevealReason` now aliases the single `BrowserBlockingSurfaceKind` schema.

## Verification

Final workspace verification:

- `bun fmt`: passed.
- `bun lint`: passed with 0 errors (456 existing workspace warnings).
- `bun typecheck`: passed, 7/7 package tasks successful.
- `bun run test`: passed, 8/8 workspace tasks successful. The largest package suite
  (`@luminor/cli`) reported 367 test files passed, 3 skipped; 4,030 tests passed, 18
  skipped.

Focused checks completed during implementation:

- Contracts browser-pane tests: 8 passed.
- Desktop manager, dialog, and controller regression slice: 63 passed.
- Full desktop suite: 74 test files passed, 1 skipped; 648 tests passed, 5 skipped.
- Browser-automation directory: 147 tests passed, including all 141 pre-existing tests and 6 new
  review-regression tests.
- Server browser-pane manager and host-client tests: 19 passed.

## Known gaps

- `auth-prompt` and `print-dialog` have protocol arms but no reliable desktop detection producer.
- `popup-window` remains intentionally unproduced in offscreen placement; fixing opener semantics
  is the separate follow-up recommended above.
- No live Electron 40 OAuth/Wayland spike was run in this investigation-only part, so hidden-child
  compositor behavior and cross-origin `postMessage` remain acceptance evidence, not a current
  claim.
- GPUI/Rust mirroring is outside this monorepo batch; the exact surface above is the handoff.
