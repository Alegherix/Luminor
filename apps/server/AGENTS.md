# apps/server

Landmines for the Node runtime. Do not catalog providers, RPC methods, or file inventories here — those belong in CodeGraph.

## Layers vs Services

- `Services/`: interfaces and stable domain APIs.
- `Layers/`: Effect wiring and live runtime assembly.

Do not put process lifecycle or transport parsing in a Service interface. Do not put domain policy only in a Layer.

## Orchestration vs providers

Orchestration owns commands, events, and the read model. Provider runtimes own vendor processes (Codex app-server and the others).

Project provider activity into orchestration events. Do not leak vendor-specific types into the web client or into `packages/contracts` beyond the shared protocol.

Codex is the most complete adapter and the reference for session/turn shape. Luminor is not Codex-only. Current provider kinds live in `packages/contracts`, not in this file.

## Diagnosis

- Empty UI or missing threads: inspect the isolated `state.sqlite` only after `orchestration.getSnapshot` over WebSocket looks empty. A healthy snapshot is a client connection problem.
- Isolated instances: pair `--home-dir` with non-default ports and `LUMINOR_PORT_OFFSET`. Unset `LUMINOR_AUTH_TOKEN` unless the client is sending it.
- Do not start the default `bun run dev` next to the user's running Luminor unless they asked to share ports and state.

## Persistence

Schema and lineage live in the persistence layers. Do not "fix" history by editing SQLite by hand when a projector, cursor, or client hydration bug is more likely.
