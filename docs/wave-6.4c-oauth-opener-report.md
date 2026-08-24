# Wave 6.4C OAuth Opener Report

Base: `5acaa574d27df0725a8b863567b126ed8480bf14`
Fix target: `c0455f42c583b22221a28e4336987d1f53558a1b`

## Files changed

- `apps/desktop/src/browserManager.ts`
  - Allows popup-classified `window.open` requests from offscreen runtimes.
  - Adopts the Electron-created child `webContents` as the canonical active pane tab.
  - Tracks the source through `openerTabId`, supports popup chains, protects the full live ancestor chain from eviction and suspension, and restores the opener when the popup closes.
  - Reuses the adopted runtime through the existing remote-runtime activation path without force-loading child navigation.
  - Publishes agent-triggered offscreen popup adoption as a canonical tab event with its adopted tab id.
- `apps/desktop/src/browserSessionPolicy.ts`
  - Centralizes hidden offscreen `BrowserWindow` options for normal pane runtimes and popup children.
- `apps/desktop/src/browserManager.test.ts`
  - Locks the attached popup path to its visible parented Electron behavior.
- `apps/desktop/src/browserSessionPolicy.test.ts`
  - Locks the offscreen popup security, preload, taskbar, and visibility options.
- `apps/desktop/src/browserAutomation/browserManagerAutomation.test.ts`
  - Covers offscreen popup allow/adoption, target-blank denial, exact child-runtime streaming, opener close teardown, popup chains, delayed and whole-thread suspension protection, `about:blank` staging, pre-navigation child URLs, canonical automation events, and hidden-window behavior with a shell parent.
- `docs/wave-6.4c-review-grok.md`
  - Preserves the authoritative FIX-THEN-MERGE review in this checkout.
- `docs/wave-6.4c-oauth-opener-report.md`
  - Records the review fixes and focused verification results.

## Review fixes

- `closeTab` now filters the canonical tab list after descendant popup teardown, so closing an opener cannot restore a stale popup snapshot or recreate its URL in a new runtime.
- Popup/runtime ownership is resolved through the full live ancestor chain and shared by the background budget, inactive-tab scheduling, delayed suspension callback, and whole-thread suspension.
- Remote activation leaves adopted child navigation under Chromium control even while `getURL()` is empty or `about:blank`.
- Agent-triggered offscreen popup opens emit a `kind: "tab"` event after adoption with the canonical `openedTabId`; the attached native-popup path retains `kind: "popup"` with `openedTabId: null`.
- Offscreen `about:blank` `_blank` staging windows remain popup-classified, allowed, and adopted.
- Adopted offscreen children are hidden immediately and are never shown or centered against a configured shell window.

## Behavior table

| Placement | Classification | Electron decision | Luminor behavior |
| --- | --- | --- | --- |
| Attached | Popup | `allow` | Keeps the visible parented OAuth child window and `window.opener`; behavior is unchanged. |
| Attached | Tab | `deny` | Defers creation of a canonical in-app tab; behavior is unchanged. |
| Offscreen | Popup | `allow` | Creates a hidden offscreen child with the select-shim preload, adopts that exact child `webContents` as an active pane tab, and sets `openerTabId` to the source tab. |
| Offscreen | Tab | `deny` | Keeps the deferred canonical new-tab path for target-blank/tab-classified opens. |

The adopted popup window is never shown, centered, or assigned a visible parent. Its options use `show: false`, `skipTaskbar: true`, `offscreen: true`, `backgroundThrottling: false`, `persist:luminor-browser`, context isolation, sandboxing, disabled Node integration, and the configured offscreen preload.

Closing an adopted popup from the pane tab, the child window, Escape, or Ctrl/Cmd-W removes its canonical tab and runtime, destroys the child window, closes popup descendants, and returns the immediate opener to active when it still exists. The existing browser-frame controller observes the active-tab state change, bumps the generation for a tab switch, and starts acquisition from the already-adopted child runtime.

## Verification

```text
cd apps/desktop && bun run test \
  src/browserSessionPolicy.test.ts \
  src/browserManager.test.ts \
  src/browserAutomation/browserManagerAutomation.test.ts \
  src/browserFrame/controller.test.ts

Result: PASS — 4 test files, 67 tests.
```

```text
cd packages/shared && bun run test src/browserSession.test.ts

Result: PASS — 1 test file, 26 tests.
```

`git diff --check` passed.

`bun fmt`, `bun lint`, and `bun typecheck` were not run because the worktree instructions prohibit running those heavyweight checks unless explicitly requested in the current conversation.

Dependency setup: `bun install --frozen-lockfile` passed and installed the missing workspace packages. No tracked dependency file or lockfile changed.

## Remaining live acceptance

- Complete a real Google OAuth flow in the GPUI pane and confirm the callback reaches `window.opener` through `postMessage`.
- Complete a real GitHub OAuth flow in the GPUI pane with the same callback check.
- Repeat Google and GitHub OAuth in the attached Electron desktop path to confirm the visible popup regression gate.
- Observe the Linux GPUI offscreen flow for absence of a visible Wayland toplevel and native-widget SIGTRAP.

No GPUI crate change or new stream identity is required for this desktop slice. `activeTabId` selects the streamed child and `openerTabId` carries the return relationship already exposed by `BrowserTabStateSnapshot`; the later GPUI work only needs to render and close/select those canonical tabs through the existing pane protocol.
