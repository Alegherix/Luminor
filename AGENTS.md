# AGENTS.md

This file is for things an agent cannot reliably infer from the repo.
Do not add architecture catalogs, file inventories, or generated maps here.
Those go stale. Use CodeGraph for structure. Map a single request path when you need a story.

Scoped landmines live next to the code they constrain:

- `apps/web/AGENTS.md`
- `apps/server/AGENTS.md`

Do not copy those rules back into this file.

## How to understand this repo

| Layer | Owns | Do not use it for |
| --- | --- | --- |
| CodeGraph (`.codegraph/`) | Symbols, callers, callees, traces, impact, "where is X" | Product intent, taste, landmines, verify policy |
| This file and scoped `AGENTS.md` | Policy, taste, landmines, package ownership, verify commands | Listing files or restating types |
| On-demand map | One request or event path for the current task, with `file:line` | A durable `CODEBASE_OVERVIEW.md` unless the user asked for one |

If CodeGraph tools are available, scout with them first. Do not start with a grep/read loop when the graph can answer. If they are not available, treat `.codegraph/` as the map and do not invent a parallel overview file.

When you need a story, map this first — not the whole repo:

1. The entry point for the surface you are changing.
2. One real path end to end (command → persistence → event → UI, or the inverse).
3. The package boundary you must not leak across.
4. Existing tests that already pin the behavior.
5. Cite `file:line` for every claim. If you cannot, the map is a guess.

Canonical traces. Start at the matching one, then stop:

- Chat turn: `apps/web` composer → `wsNativeApi` / `wsTransport` → `apps/server` `wsRpc` → `orchestration` engine → provider runtime → projected `orchestration.domainEvent` → `ChatView`
- Protocol change: `packages/contracts` schemas first, then server handlers, then the web client

Do not write the map back into this file.

## Verify

- Do not run `bun fmt`, `bun lint`, or `bun typecheck` unless the user explicitly asks for them in the current conversation.
- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering a task completed.
- Treat those three as one heavyweight final pass. Do not rerun the set during iteration.
- After a recent full pass, a small follow-up should not rerun them unless the user asks.
- If the user asks to focus on code only, change the code first and verify only when asked.
- Never run `bun test`. Always `bun run test` (Vitest). `bun test` is a different runner.

## Priorities

1. Performance first.
2. Reliability first.
3. Predictable behavior under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

This repo is early WIP. Sweeping maintainability changes are welcome when they earn their keep.

## Model selection

Rankings, higher = better. Cost is what I actually pay (OpenAI is near-free for me due to a deal), not list price. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy.

| model | cost | intelligence | taste |
| --- | --- | --- | --- |
| gpt-5.6-sol | 9 | 8 | 5 |
| sonnet-5 | 5 | 5 | 7 |
| opus-4.8 | 4 | 7 | 8 |
| fable-5 | 2 | 9 | 9 |

- These are defaults, not limits. If a cheaper model's output misses the bar, rerun with a smarter model without asking. Judge the output, not the price tag.
- Cost is a tie-breaker only. When axes conflict for anything that ships: intelligence > taste > cost.
- Bulk or mechanical work: gpt-5.6-sol.
- Anything user-facing needs taste ≥ 7.
- Reviews: fable-5 or opus-4.8, optionally gpt-5.6-sol as an extra independent perspective.
- Never use Haiku.
- gpt-5.6-sol is only reachable through the Codex CLI (`codex exec` / `codex review`). Use the codex-implementation, codex-review, and codex-computer-use skills; otherwise `codex exec -s read-only` with a self-contained prompt.
- Claude models run via the Agent/Workflow model parameter.

Using gpt-5.6-sol inside workflows and subagents (those parameters only take Claude models):

- Spawn a thin Claude wrapper with `model: 'sonnet', effort: 'low'` that writes a self-contained Codex prompt, runs `codex exec` via Bash, and returns the report.
- Label those agents `gpt-5.6-sol:…` so the UI does not hide who actually did the work.
- Codex can exceed a 10-minute Bash timeout: pass an explicit timeout, or run in the background and poll a report file.
- Parallel gpt-5.6-sol implementation agents must use `isolation: 'worktree'`.
- Workflow token budgets count Claude tokens only. Codex work is free to the budget.

Give gpt-5.6-sol substantial multi-step work when it is the right model. Do not split a task merely because it is large. The brief must be self-contained: goal, constraints, scope, deliverables, and how to verify.

## Package ownership

These constraints are not optional style. They are the reason the packages exist.

- `apps/server`: Node runtime. Orchestration, provider sessions, WebSocket RPC, persistence. Owns process lifecycle.
- `apps/web`: React/Vite UI. Session UX, rendering, client state. Talks to the server over WebSocket. Does not own protocol schemas.
- `apps/desktop`: Electron shell. Windowing, updater, native integration. Does not reimplement server domain logic.
- `packages/contracts`: Schema-only. No runtime logic.
- `packages/shared`: Cross-runtime helpers. Explicit subpath exports (for example `@luminor/shared/git`). No barrel `index`.

Provider kinds and model options live in `packages/contracts` and are resolved in `packages/shared/src/model.ts`. Do not hardcode a provider list here.

## Landmines

- Do not start default `bun run dev` while another Luminor instance is running unless the user wants shared ports and state. Use an isolated home dir and non-default ports. Dry-run first. Unset `LUMINOR_AUTH_TOKEN` for browser-dev instances unless the web app is configured to send that token.
- A desktop app can bind `127.0.0.1:<port>` while the dev server binds IPv6 `*:<port>`. Check both with `lsof` before assuming the port is free.
- If the UI shows no threads, probe `orchestration.getSnapshot` over WebSocket before changing SQL. A healthy snapshot means the client never connected, not that history is empty.
- Do not add local copies of logic that already exists in `packages/shared` or a sibling module. Extract or reuse.

## Maintainability

If you add behavior, first check whether shared logic already exists. Duplicate logic across files is a smell. Change existing code when that is the cleaner fix. Do not paper over a problem with a local special case.

## Reference implementations

- Codex app-server: https://developers.openai.com/codex/sdk/#app-server
- Open-source Codex: https://github.com/openai/codex
- CodexMonitor: https://github.com/Dimillian/CodexMonitor
