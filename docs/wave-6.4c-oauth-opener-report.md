# Wave 6.4C OAuth Opener Report

Base: `5acaa574d27df0725a8b863567b126ed8480bf14`

## Files changed

- `apps/desktop/src/browserManager.ts`
  - Allows popup-classified `window.open` requests from offscreen runtimes.
  - Adopts the Electron-created child `webContents` as the canonical active pane tab.
  - Tracks the source through `openerTabId`, supports popup chains, protects opener runtimes from eviction, and restores the opener when the popup closes.
  - Reuses the adopted runtime through the existing remote-runtime activation path.
- `apps/desktop/src/browserSessionPolicy.ts`
  - Centralizes hidden offscreen `BrowserWindow` options for normal pane runtimes and popup children.
- `apps/desktop/src/browserManager.test.ts`
  - Locks the attached popup path to its visible parented Electron behavior.
- `apps/desktop/src/browserSessionPolicy.test.ts`
  - Locks the offscreen popup security, preload, taskbar, and visibility options.
- `apps/desktop/src/browserAutomation/browserManagerAutomation.test.ts`
  - Covers offscreen popup allow/adoption, target-blank denial, exact child-runtime streaming, both close paths, popup chains, and opener eviction protection.

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

Result: PASS — 4 test files, 62 tests.
```

```text
cd packages/shared && bun run test src/browserSession.test.ts

Result: PASS — 1 test file, 26 tests.
```

`git diff --check` passed.

`bun fmt`, `bun lint`, and `bun typecheck` were not run because the worktree instructions prohibit running those heavyweight checks unless explicitly requested in the current conversation.

Dependency setup note: the first `bun install --frozen-lockfile` attempt resolved the workspace packages but its `node-pty` install script stopped because `node-gyp` is unavailable. The focused Vitest commands above subsequently ran and passed, and no tracked dependency files changed.

## Remaining live acceptance

- Complete a real Google OAuth flow in the GPUI pane and confirm the callback reaches `window.opener` through `postMessage`.
- Complete a real GitHub OAuth flow in the GPUI pane with the same callback check.
- Repeat Google and GitHub OAuth in the attached Electron desktop path to confirm the visible popup regression gate.
- Observe the Linux GPUI offscreen flow for absence of a visible Wayland toplevel and native-widget SIGTRAP.

No GPUI crate change or new stream identity is required for this desktop slice. `activeTabId` selects the streamed child and `openerTabId` carries the return relationship already exposed by `BrowserTabStateSnapshot`; the later GPUI work only needs to render and close/select those canonical tabs through the existing pane protocol.
