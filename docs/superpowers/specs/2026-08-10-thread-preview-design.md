# Thread Preview — Design

Date: 2026-08-10
Status: Approved (design). Implementation plan not yet written.

## Problem

A thread's work happens in an isolated git worktree. There is no way to see that
work running before merging it. Today the only option is the manual procedure in
`.claude/skills/verify/SKILL.md` — hand-picked ports, hand-set `LUMINOR_HOME`,
two shells. In practice that means merging without ever having looked at the
change in a running application.

## Goal

A control in the right dock that starts a project-configured command inside the
thread's worktree and shows the resulting web app in an embedded pane.

Generic across projects: the user configures the command per project. Luminor
supplies the worktree, the port, the process supervision, and the viewport.

## Decisions

| Decision                   | Choice                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Scope                      | Generic per project; the user configures the command                                               |
| Ownership                  | One preview per thread; survives thread switches and window closes                                 |
| URL discovery              | Injected port when a URL template is configured, otherwise stdout sniffing, otherwise manual entry |
| Viewing surface            | Embedded only (a right-dock pane). External/desktop previews are out of scope                      |
| Config location            | Project settings in the DB, as a `ProjectScript`                                                   |
| Threads without a worktree | Launcher entry visible but disabled                                                                |

## Existing building blocks

This feature is mostly composition. What already exists:

- `ProjectScript` — `{id, name, command, icon, runOnWorktreeCreate}`, persisted
  per project (`packages/contracts/src/orchestration.ts:383`,
  `apps/server/src/persistence/Layers/ProjectionProjects.ts`).
- `runProjectCommandInTerminal` (`apps/web/src/projectTerminalRunner.ts`) —
  opens a thread-scoped managed terminal at a given cwd with
  `LUMINOR_PROJECT_ROOT` / `LUMINOR_WORKTREE_PATH` in env, then writes the command.
- Managed terminal runtime with output events, session status
  (`starting | running | exited | error`), history replay, and process-tree kill
  (`apps/server/src/terminal/`).
- Right dock pane system with singleton kinds, launcher, and add menu
  (`apps/web/src/rightDockStore.logic.ts`,
  `apps/web/src/components/chat/rightDockPaneMeta.tsx`).
- Thread worktree paths (`apps/server/src/managedWorktrees.ts`).
- Loopback port availability checks (`NetService.isPortAvailableOnLoopback`,
  already used by `scripts/dev-runner.ts`).

## Architecture

### Script role

`ProjectScript` gains a `kind` discriminant replacing the `runOnWorktreeCreate`
boolean, which is already a de-facto role marker:

```
kind: "manual" | "setup" | "preview"
```

At most one `preview` script per project, enforced when scripts are saved:
setting a script to `preview` demotes any existing preview script to `manual`.
The same rule already needs to hold for `setup`.

The preview script gains one optional field:

- `urlTemplate?: string` — e.g. `http://localhost:{port}`.
  - Template contains `{port}`: Luminor allocates a free loopback port, exposes
    it to the command as `PORT` and `LUMINOR_PREVIEW_PORT`, and substitutes it
    into the template. The URL is known before the process starts.
  - Template present without `{port}` (a fixed URL): no port is allocated; the
    URL is used as-is once the process reaches `running`.
  - No template: the URL is discovered by sniffing stdout.

No separate env map and no separate cwd: cwd is always the thread's worktree.

### Execution

The preview process _is_ a managed terminal, opened via
`runProjectCommandInTerminal` with a reserved terminal id (`preview`) per thread.
This inherits logs, scrollback, restart, status events, and process-tree kill
without new process code.

### New modules

1. `packages/shared/src/preview/urlDetection.ts` — pure function over a sliding
   tail buffer returning a URL or null. Strips ANSI, matches
   `https?://(localhost|127.0.0.1|0.0.0.0|[::1])(:port)?/...`, normalizes
   `0.0.0.0` to `localhost`.
2. `packages/shared/src/preview/portAllocation.ts` — thin wrapper over
   `NetService.isPortAvailableOnLoopback` that finds a free port and holds an
   in-flight reservation.
3. Server-side preview registry — in-memory, keyed by `threadId`, owning the
   state machine and the output tap.
4. `apps/web/src/hooks/useThreadPreview.ts` — client view of the state machine.
5. `apps/web/src/components/chat/DockPreviewPane.tsx` — the pane.

### Why URL detection lives on the server

The web client already receives `TerminalOutputEvent`, so client-side sniffing
would be less code. But then the URL is lost on reload, and never found at all
if no client is attached while the server starts. The server owns the process,
so it owns the facts about it. The detection function itself lives in
`packages/shared` and is pure.

### Why preview state is in-memory

The preview process is a child of the server. If the server dies, the process
dies. Persisted run state could therefore only ever lie. Only the _config_ (the
preview script on the project) is persisted. After a server restart the registry
is empty and the pane shows `idle` — which is true.

## Data flow

### Start

1. Web calls `preview.start({ threadId })`.
2. Server resolves the project's preview script and the thread's `worktreePath`.
   No worktree → error (the launcher entry would already have been disabled).
3. If `urlTemplate` contains `{port}`, allocate a free loopback port. Allocation
   happens under a lock in the registry and keeps in-flight ports reserved, so
   two concurrent starts cannot pick the same port in the TOCTOU window between
   check and spawn.
4. Spawn via `runProjectCommandInTerminal`: terminal id `preview`, cwd =
   worktree, env = `LUMINOR_PROJECT_ROOT`, `LUMINOR_WORKTREE_PATH`, plus `PORT`
   and `LUMINOR_PREVIEW_PORT` when a port was allocated.
5. Status `starting`. The output tap looks for a URL. On hit → `running(url)`,
   pushed to the client.
6. No URL within 90 s but the process is alive → `running(url: null)`. The pane
   offers manual URL entry. The timeout never kills the process.

### Stop

`preview.stop` kills the whole process tree via
`apps/server/src/terminal/processTreeKiller.ts`. Dev servers spawn children;
killing only the shell leaves the port held.

Automatic stop on: worktree removal, thread archive, thread delete, server
shutdown. All four route through one `stopPreview(threadId)`.

Restart is stop + start with a fresh port allocation — simpler than reusing a
port the dying process may not have released.

### Push channel

A new `preview.status` event alongside the existing terminal events:
`{ threadId, status, url, port, message }`. The client never parses terminal
output.

## UI

### Pane kind

New singleton right-dock pane kind `preview`, icon `MonitorPlayIcon`, label
"Preview". Registered in `RIGHT_DOCK_PANE_KINDS`, `RIGHT_DOCK_PANE_META`, the add
menu, and the launcher order (after `browser`).

Gating follows the existing pattern (Git gates on repository discovery, Explorer
on a concrete workspace): Preview gates on the thread having a worktree. Without
one, the launcher entry is disabled with the tooltip "Preview requires a
worktree".

### `DockPreviewPane`

Header (via the shared `DockPaneHeader`): status dot plus control.

| State    | Header                                        |
| -------- | --------------------------------------------- |
| idle     | `Start`                                       |
| starting | spinner, `Cancel`                             |
| running  | port chip (`:5174`), `Reload`, `Logs`, `Stop` |
| failed   | red dot, last stderr line, `Retry`            |

Body: a webview on the preview URL when running. Otherwise a centered empty
state — heading, one line of explanation, primary action. The failed state shows
the last stderr line.

No log view of its own. `Logs` opens a `terminal` pane on the preview terminal.
The dock already composes multiple panes side by side.

When no preview script is configured, the body shows an inline form — command
plus optional URL template — which saves the project's preview script and starts
it. Settings exposes the same fields for later editing.

When a URL is detected, the preview pane is focused if the dock is open. A
closed dock is not opened automatically: a background process should not hijack
the layout.

## Testing

| Unit                   | Coverage                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `urlDetection`         | table test: vite banner, next banner, ANSI-wrapped URL, `127.0.0.1`, `[::1]`, `0.0.0.0` → `localhost`, a URL inside an error message that must not match, a URL split across two writes |
| `portAllocation`       | concurrent allocations return distinct ports; in-flight reservation is released on spawn failure                                                                                        |
| preview registry       | start→running→stop; double start is idempotent; process death → `failed`; stop on a non-running preview is a no-op                                                                      |
| `rightDockStore.logic` | `preview` as a singleton kind, extending the existing singleton tests                                                                                                                   |
| `DockPreviewPane`      | state→render mapping, browser-mode test following the existing `.browser.tsx` convention                                                                                                |

The split-across-chunks case is the real failure mode in URL sniffing, which is
why the detector keeps a sliding tail buffer rather than examining one chunk.

## Error handling

- Command not found, or immediate non-zero exit → `failed` with the last stderr line.
- Port taken despite allocation (another process won the race) → the process
  dies, `failed`, `Retry` allocates a new port.
- Worktree missing `node_modules` → the script's concern, not Luminor's. The
  user configures `bun install && bun dev`, or uses the existing setup script.
- Server death → the process tree dies with it; the registry is empty on
  restart and the pane shows `idle`.
- Switching threads → the process keeps running; another thread's pane shows its
  own status.

## Migration

`runOnWorktreeCreate: boolean` → `kind: "manual" | "setup" | "preview"`, with a
data migration over the `projects.scripts` JSON column
(`apps/server/src/persistence/Layers/ProjectionProjects.ts`). `true → "setup"`,
`false → "manual"`. Must satisfy `scripts/check-migration-lineage.ts`.

Call sites that currently branch on `runOnWorktreeCreate` and must move to
`kind`: `primaryProjectScript` and `setupProjectScript`
(`apps/web/src/projectScripts.ts`), `selectPrimaryProjectRunCommand` and
`upsertProjectRunCommandScripts` (`apps/web/src/projectRunTargets.ts`), and
`apps/server/src/worktreeSetup.ts`. `primaryProjectScript` must exclude
`preview` as well as `setup`, so starting a preview does not change what the
sidebar run button does.

## Out of scope

- External / desktop previews (`open: "external"`), needed for `dev:desktop`.
- Multiple concurrent previews per thread.
- Previews shared between threads on the same worktree.
- Automatic isolated `LUMINOR_HOME` — Luminor-specific, belongs in the user's
  preview command, not in the product.
- Coupling agent file edits to preview reload. Vite already does this.
