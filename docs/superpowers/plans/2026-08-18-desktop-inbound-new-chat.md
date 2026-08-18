# Desktop inbound new-chat Implementation Plan

> **For agentic workers:** Implement only the task you were assigned. The spec
> is authoritative. Do not expand scope. Do not edit files owned by another task.

**Goal:** A running Luminor Dev instance accepts `--new-chat` over Electron
second-instance, creates a real thread under Chats / `Crashes`, starts the turn,
and Omarchy crash clicks route there when Dev is open.

**Architecture:** Desktop main parses argv, POSTs to an authenticated backend
route that owns `folder.create` + `thread.create` + `thread.turn.start`, then
IPCs the renderer to navigate. A PATH shim is the only Omarchy change.

**Tech Stack:** Electron, Effect HTTP, orchestration commands, Vitest, bash.

**Spec:** `docs/superpowers/specs/2026-08-18-desktop-inbound-new-chat-design.md`

## Global Constraints

- Target for crash threads: `{ provider: "grok", model: "grok-4.6", options: { reasoningEffort: "high" } }`
- Folder name exactly `Crashes` (project-owned on the chat container)
- Never edit `/usr/share/omarchy`
- Never start Luminor from a crash click
- After successful second-instance handoff, do not also open a grok TUI
- Prompt via `--prompt-file` only; delete after successful read
- `bun run test` only (never `bun test`)
- Do not add explanatory source comments
- Do not add a new `ThreadCreationSource`

## File ownership

| Task | Owns | Must not touch |
| --- | --- | --- |
| 1 Server inbound | `apps/server/src/inbound/**`, `apps/server/src/http.ts` (route wire-up only), server tests for inbound | `apps/desktop/**`, `apps/web/**`, `scripts/omarchy-agent-crash`, `~/.local/bin/**` |
| 2 Desktop + web | `apps/desktop/src/inbound/**`, `apps/desktop/src/main.ts`, desktop tests, `apps/web` IPC navigate | `apps/server/**`, crash shim, `luminor-dev-open` |
| 3 Crash routing | `scripts/omarchy-agent-crash`, `~/.local/bin/omarchy-agent-crash`, `~/.local/bin/luminor-dev-open` | Luminor app source |

HTTP contract both Task 1 and Task 2 implement against (do not renegotiate):

```
POST /internal/inbound/new-chat
Authorization: Bearer <backendAuthToken>
Content-Type: application/json

{
  "title"?: string,
  "prompt": string,
  "folderName"?: string,
  "submit": boolean
}

200 { "threadId": string }
4xx/5xx { "error": string }
```

Use `requireAuthenticatedMutationRequest` (same trusted-origin rules as other mutations). Desktop origin is `luminor://app` and already in the trusted set.

---

### Task 1: Server inbound handler

**Files:**
- Create: `apps/server/src/inbound/newChat.ts`
- Create: `apps/server/src/inbound/newChat.test.ts`
- Modify: `apps/server/src/http.ts` — register the POST route

**Does:**
1. Resolve chat container: first project `kind === "chat"`, else legacy Home via `isLegacyHomeChatContainerRow` / `matchesLegacyHomeChatWorkspaceRoot` from `@luminor/shared/projectContainers`. Fail if none.
2. If `folderName` set: find non-deleted folder with that exact name owned by the container project; else `folder.create` unpinned project owner. Reuse; never duplicate `Crashes`.
3. `thread.create` with container `projectId`, that `folderId`, title, Grok 4.6 high (`GrokModelSelection`: `{ provider: "grok", model: "grok-4.6", options: { reasoningEffort: "high" } }`), `runtimeMode: "full-access"`, `interactionMode: "default"`, `envMode: "local"`. Leave `workingDirectory` unset. Leave `creationSource` unset.
4. If `submit`: `thread.turn.start` with the prompt as the user message, no attachments. If create succeeded and start fails, leave the thread and still return `{ threadId }` (log the start error).
5. Dispatch through the same orchestration engine path `wsRpc` uses (`dispatchOrchestrationCommand` + normalizer). Do not invent a second write path.

**Tests (TDD, `cd apps/server && bun run test src/inbound/newChat.test.ts`):**
- Creates `Crashes` once; second call reuses the folder
- Uses the chat container, not an ordinary project
- Starts a turn iff `submit === true`
- Returns `threadId` when turn start fails after create
- Rejects unauthenticated requests (route test or handler auth)

Commit on the worktree branch when tests pass.

---

### Task 2: Desktop parser, second-instance, HTTP client, renderer navigate

**Files:**
- Create: `apps/desktop/src/inbound/parseInboundArgv.ts`
- Create: `apps/desktop/src/inbound/parseInboundArgv.test.ts`
- Create: `apps/desktop/src/inbound/inboundNewChat.ts` (queue + POST + delete prompt file)
- Create: `apps/desktop/src/inbound/inboundNewChat.test.ts`
- Modify: `apps/desktop/src/main.ts` — parse cold-start argv and `second-instance` `commandLine`; focus; enqueue
- Modify web: IPC listener that navigates to the returned `threadId` (follow existing desktop IPC / preload patterns in `apps/desktop/src/preload.ts` and the web native-api bridge)

**Parser rules (from spec):**
- `--new-chat` required to treat as inbound
- `--prompt-file` required, must be absolute
- `--title` optional
- `--folder` optional
- `--submit` boolean flag
- Ignore Electron/chromium switches (`--type=`, `--luminor-dev-root=`, etc.)
- Unknown flags after inbound mode → error, no thread
- Relative `--prompt-file` → error

**Runtime:**
- Read prompt file; reject empty; reject over `PROVIDER_SEND_TURN_MAX_INPUT_CHARS` (import from contracts, do not hardcode a guessed number)
- Delete file after successful read; if unlink fails, log and continue
- Queue: one at a time, FIFO, two crashes = two threads
- If backend not ready, wait until it is
- POST to `${backendHttpUrl}/internal/inbound/new-chat` with `Authorization: Bearer ${backendAuthToken}`
- Default title if missing: first non-empty prompt line, trimmed, max 80 chars
- After `{ threadId }`, IPC renderer to open that thread. If renderer not ready, retry on window load
- `second-instance` without `--new-chat`: only `focusMainWindow()` (today’s behavior)

**Tests:** `cd apps/desktop && bun run test src/inbound`

Commit on the worktree branch when tests pass.

---

### Task 3: Omarchy crash shim + luminor-dev-open

**Files:**
- Create: `scripts/omarchy-agent-crash`
- Install: symlink or copy to `~/.local/bin/omarchy-agent-crash` (must precede `/usr/share/omarchy/bin` on PATH)
- Modify: `~/.local/bin/luminor-dev-open` only — do not change the systemd unit

**Shim:**
- Args: `pid comm exe signal` (same as packaged)
- Build the **same prompt** as `/usr/share/omarchy/bin/omarchy-agent-crash` (read that file; copy the prompt template and skill path)
- Detect Dev with the same process match `luminor-dev-open` already uses (`--luminor-dev-root=` and `dist-electron/main.js` on one command line)
- Dev down: `exec /usr/share/omarchy/bin/omarchy-agent-crash "$@"` (absolute path, no recurse)
- Dev up: write prompt to `mktemp`, run `luminor-dev-open --new-chat --prompt-file … --title "Process crashed: $comm" --folder Crashes --submit`. If spawn/handoff fails, exec the packaged script with original args
- Do not wait for thread creation

**`luminor-dev-open`:**
- If Electron is up and argv contains `--new-chat`: spawn the **live** Electron binary + `dist-electron/main.js` + inbound flags. Do not start `luminor-dev.service`. Exit 0 after the second process exits 0 (lock handoff)
- Without `--new-chat`, unchanged (focus / start unit)

Do not edit `/usr/share/omarchy`. Keep the script `set -euo pipefail` and executable.

Commit the repo script on the worktree branch. The `~/.local/bin` install is machine-local and expected.

---

## Merge (orchestrator only)

After all three worktrees are terminal: review diffs, merge into this checkout, run one bundled `bun fmt && bun lint && bun typecheck` plus focused `bun run test` for inbound modules. Do not merge unrelated dirty files already in the parent tree.
