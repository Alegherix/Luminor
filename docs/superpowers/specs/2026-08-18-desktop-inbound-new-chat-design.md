# Desktop inbound new-chat — design

Date: 2026-08-18
Status: approved (design), implementation plan pending

## Problem

Omarchy crash notifications run `omarchy-agent-crash`, which launches the
default CLI agent (here: Grok) in a TUI. Diagnosis history lands in random
CLI sessions. Daily work already happens in Luminor Dev, so that history is
harder to find than it should be.

Luminor has no way for a local process to open a chat in a running instance.
`luminor://` serves packaged static files. `second-instance` only focuses the
window and drops argv. The backend auth token is random per desktop start.

## Goal

Add a first-class inbound surface: a running Luminor desktop instance accepts
`--new-chat` on a second launch, creates a real thread, starts the turn, and
navigates to it.

First consumer: the Omarchy crash notification. If Luminor Dev is open, the
click creates a Grok 4.6 high thread under a **Crashes** folder in the Chats
container, with the same prompt `omarchy-agent-crash` builds today. If Dev is
not open, the click keeps today's grok-in-terminal behavior. The click never
starts Luminor.

## Decisions

| Decision | Choice |
| --- | --- |
| Transport | Electron `second-instance` argv, not inbox files or a unix socket |
| Prompt | `--prompt-file` only. Never inline. File deleted after a successful read |
| Auto-start | `--submit` starts the turn immediately |
| Landing | Chats container (`kind: "chat"`, else legacy Home). Folder name exactly `Crashes`. Not an ordinary project |
| Default target | `{ provider: "grok", model: "grok-4.6", options: { reasoningEffort: "high" } }` |
| Runtime | `full-access`, `interactionMode: "default"`, `envMode: "local"` |
| Closed Dev | Crash shim execs the packaged `omarchy-agent-crash`. Does not start Dev |
| Omarchy package | Never edit `/usr/share/omarchy`. User PATH shim only |
| Prod | Out of scope for v1. Same argv shape can be reused later |
| `--project` / model flags | Out of scope for v1 |
| `creationSource` | Unset. Do not add a new `ThreadCreationSource` literal |
| Who creates the thread | Desktop main → authenticated backend HTTP. Renderer only navigates |
| Fallback after handoff | The shim falls back to the grok TUI only if Dev is down or the second-instance spawn/handoff fails. After a successful handoff, Luminor owns the outcome; a later inbound HTTP failure does not also open a TUI |

### Rejected alternatives

- **Inbox drop under `~/.luminor/.../inbox`.** Any script can write a file, but
  delivery is async, there is no ack, and a hung window looks like success.
- **Unix socket / command port.** More machinery than `second-instance` for one
  consumer.
- **Renderer owns create+start.** Races if the window is on Settings or still
  hydrating. Desktop already holds the backend token.
- **Make Luminor an Omarchy default agent.** Would change Super+agent and the
  whole `omarchy-agent` matrix. Crash-click is the only path we are changing.

## Current state

Omarchy:

- `omarchy-crash-watch` notifies with
  `--exec 'omarchy-agent-crash <pid> <comm> <exe> <signal>'`.
- Packaged `omarchy-agent-crash` builds the diagnose-crash prompt and runs
  `omarchy-agent --prompt`. That launches grok in `omarchy-launch-tui`.
- Default agent is stored at `~/.config/omarchy/defaults/agent`.

Luminor Dev on this machine:

- systemd user unit `luminor-dev.service` runs `bun run electron:dev`.
- `~/.local/bin/luminor-dev-open` focuses a live Electron
  (`--luminor-dev-root=… dist-electron/main.js`) or starts/restarts the unit.
- Desktop `requestSingleInstanceLock()` is scoped by flavor `userData`.
- `app.on("second-instance")` only calls `focusMainWindow()`.
- Backend listens on `127.0.0.1` with a per-start `LUMINOR_AUTH_TOKEN`.
- `thread.create` requires a `projectId`. Chats live in the system chat
  container, not in a user project.
- Folder create is idempotent by name under an owner
  (`folder.create` / `luminor_create_folder`).
- `DEFAULT_RUNTIME_MODE` is `full-access`.

## Architecture

```text
notification click
  -> ~/.local/bin/omarchy-agent-crash
       |  Electron Dev up?
       |  no  -> exec /usr/share/omarchy/bin/omarchy-agent-crash
       |  yes -> write prompt file
       |         luminor-dev-open --new-chat --prompt-file … \
       |           --title "Process crashed: $comm" --folder Crashes --submit
       |         on failure -> exec packaged omarchy-agent-crash

luminor-dev-open (Electron already up, --new-chat present)
  -> spawn the live Electron binary + main.js + inbound argv
  -> first instance: second-instance(commandLine)
       parse flags
       focus window
       read + delete prompt file
       POST /internal/inbound/new-chat  (backend auth token)
         find chat container
         find-or-create folder "Crashes"
         thread.create
         thread.turn.start
       IPC renderer: navigate to threadId
```

Three units, each independently testable:

1. **Argv parser** — desktop, no Electron required.
2. **Inbound HTTP handler** — server: resolve container, folder, create, start.
3. **Crash shim + open-script routing** — machine-local consumers of (1).

## External contract

Second-launch argv (also accepted on a cold start and queued until the backend
is up; the crash shim never uses the cold-start path):

```text
<electron> --luminor-dev-root=… dist-electron/main.js \
  --new-chat \
  --prompt-file /tmp/luminor-inbound-XXXX.md \
  --title "Process crashed: node" \
  --folder Crashes \
  --submit
```

| Flag | Required | Meaning |
| --- | --- | --- |
| `--new-chat` | yes | Selects the inbound command. Absent → today's focus/start behavior |
| `--prompt-file` | yes with `--new-chat` | Absolute path. Must be a regular file owned by the user, readable, non-empty |
| `--title` | no | Thread title. Default: first non-empty line of the prompt, trimmed, max 80 chars |
| `--folder` | no | Folder name under the Chats container. Crash consumer always sends `Crashes` |
| `--submit` | no | If present, start the turn. Crash consumer always sends it |

Parser rules:

- Unknown flags after `--new-chat` are an error (do not create a thread).
- `--prompt-file` must be absolute. Relative paths are rejected.
- Electron/chromium switches (`--type=`, `--luminor-dev-root=`, etc.) are
  ignored by the inbound parser.
- Prompt body max length is `PROVIDER_SEND_TURN_MAX_INPUT_CHARS`. Oversize is
  an error, not a silent truncate.

After a successful read, desktop deletes the prompt file. If delete fails, log
and continue; the thread is still created. If the read fails, do not delete.

## Routing (machine-local)

### `~/.local/bin/omarchy-agent-crash`

Same argv as the packaged script: `pid comm exe signal`. Same prompt text,
including the diagnose-crash skill path.

Detection of Dev: the same process match `luminor-dev-open` already uses
(`--luminor-dev-root=` and `dist-electron/main.js` on one command line).

- Dev up: write the prompt to a `mktemp` file, invoke `luminor-dev-open` with
  the flags above. If open or inbound fails, exec the packaged script with the
  original arguments.
- Dev down: exec `/usr/share/omarchy/bin/omarchy-agent-crash` with the original
  arguments. Use that absolute path so the shim cannot recurse.

The shim is sourced from this repo (`scripts/omarchy-agent-crash`) and
installed as a symlink or copy into `~/.local/bin`, which must precede
`/usr/share/omarchy/bin` on PATH (already true for this machine).

### `~/.local/bin/luminor-dev-open`

Today: if Electron is up, focus and exit. Extra argv is dropped.

After: if Electron is up and argv contains `--new-chat`, spawn the **already
running** Electron binary and `dist-electron/main.js` plus the inbound flags.
Do not start `luminor-dev.service`. The second Electron process loses the
single-instance lock, delivers `commandLine` to the first, and quits.

Without `--new-chat`, behavior is unchanged.

If Electron is not up, do not interpret `--new-chat`. The crash shim never
calls this script in that state.

## Desktop receive

`apps/desktop/src/main.ts` today:

```ts
app.on("second-instance", () => {
  focusMainWindow();
});
```

Change:

1. Shared parser reads inbound flags from `process.argv` (cold start) and from
   `second-instance`'s `commandLine`.
2. On `--new-chat`: `focusMainWindow()`, then run the inbound command.
3. One in-process queue. Commands run strictly in order. A second crash while
   the first is in flight waits; it does not replace it. Two crashes become
   two threads.
4. If the backend is not ready, the command stays queued until it is. If the
   window is gone before drain, the command fails (crash shim then falls back
   only if it is still waiting — see Errors).

The crash shim treats `luminor-dev-open` as done once the second Electron
process has been spawned and has exited 0 (lock handoff). It does **not** wait
for thread creation. If spawn/handoff fails, it falls back to the packaged
script. If handoff succeeds and Luminor later fails internally, the user sees
that in Dev; we do not also open a grok TUI.

## Inbound HTTP

Desktop main already knows `backendHttpUrl` and `backendAuthToken`. It POSTs
JSON to an authenticated backend route, for example
`POST /internal/inbound/new-chat`.

Request:

```ts
{
  title?: string;
  prompt: string;
  folderName?: string; // crash consumer: "Crashes"
  submit: boolean;
  // v1 implied target when omitted:
  // provider: "grok", model: "grok-4.6", reasoningEffort: "high"
}
```

Response: `{ threadId: string }`.

Handler steps, all on the server:

1. Resolve the Chats container: first project with `kind: "chat"`, else the
   legacy Home row (`isLegacyHomeChatContainerRow`). If none, fail.
2. If `folderName` is set, find a non-deleted folder with that exact name owned
   by the container project. If missing, `folder.create` with that name,
   unpinned, project owner. Reuse; never create a second `Crashes`.
3. `thread.create` with that `projectId` / `folderId`, the title, Grok 4.6
   high, `full-access`, `default` interaction, `local` env. Leave
   `workingDirectory` unset (chat containers have no real project cwd).
4. If `submit` is true, `thread.turn.start` with the prompt as the user
   message, no attachments.

The renderer is not in this path. After a `threadId` returns, desktop main
sends an IPC to the renderer to navigate to that thread. If the renderer is
not ready, retry when the window finishes loading. The thread already exists
and the turn is running.

## Errors

| Case | Behavior |
| --- | --- |
| Dev not running | Packaged `omarchy-agent-crash` (grok TUI) |
| `--new-chat` without a readable prompt file | No thread. Log. Second-instance spawn still exits 0 after handoff; crash shim already handed off. For the shim's own preflight (cannot write temp file), fall back to packaged script |
| `luminor-dev-open` cannot spawn the live Electron | Crash shim falls back to packaged script |
| No Chats container | Inbound HTTP fails. Thread not created. Visible in desktop log. No grok TUI (handoff already happened) |
| `thread.create` fails | HTTP error. No thread |
| `thread.create` ok, `thread.turn.start` fails | Leave the thread. Return the `threadId` and still navigate. Do not delete the thread |
| Prompt file delete fails after read | Log. Continue |
| Two crashes in one minute | Two threads, queued in order. Omarchy's own 60s per-comm dedupe still applies upstream |

## Testing

- Parser: flags, ignored Electron switches, rejected relative `--prompt-file`,
  rejected unknown flags, title default from first prompt line, oversize prompt.
- Inbound handler: creates `Crashes` once; second call reuses the folder;
  uses the chat container not an ordinary project; starts a turn iff `submit`;
  leaves the thread if turn start fails after create.
- Desktop: `second-instance` with `--new-chat` focuses and POSTs; without
  `--new-chat` only focuses.
- Crash shim: Dev down → packaged path; Dev up → open-script with flags;
  packaged path is the absolute Omarchy binary.

No new browser-e2e required for v1. No change to `bun test` invocation rules
(`bun run test` only).

## Out of scope

- Packaged Luminor Prod inbound
- Starting Dev from a crash click
- `--project`, `--provider`, `--model`
- Deep link scheme (`luminor://chat?...`)
- Editing `/usr/share/omarchy` or adding Luminor to `omarchy-default-agent`
- Pinning the Crashes folder
- New `ThreadCreationSource`
- Unix socket / inbox file transports

## Files likely touched

- `apps/desktop/src/main.ts` — parse argv, second-instance, queue, HTTP, IPC
- `apps/desktop/src/` — new inbound parser module + tests
- `apps/server/src/http.ts` — authenticated `POST /internal/inbound/new-chat`
- `apps/server/src/` — inbound handler + tests (container, folder, create, start)
- `apps/web/src/` — IPC listener that navigates to `threadId`
- `scripts/omarchy-agent-crash` — versioned shim; install to `~/.local/bin`
- `~/.local/bin/luminor-dev-open` — forward `--new-chat` to the live Electron
  (machine-local; not a packaged Luminor artifact)
