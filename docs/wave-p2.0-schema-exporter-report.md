# Wave P2.0 — full-surface protocol schema exporter

Branch: `luminor/add-full-surface-schema-exporter`

## What landed

- `packages/contracts/scripts/export-protocol-schema.ts` — ported from
  `luminor/wave-contract-producer` (allowlist mode unchanged) and extended with a
  `--full` full-surface mode that enumerates `WsFeatureRpcGroup`,
  `WsDeviceRpcGroup`, `WsBrowserPaneRpcGroup`, and `WsBootstrapRpcGroup` via their
  `requests` maps and dumps every method's payload/success/error schemas.
- `packages/contracts/schema/protocol.v1.full.json` — the committed, deterministic
  full dump (CI-diffable baseline).
- `schema:protocol` and `schema:protocol:full` scripts in
  `packages/contracts/package.json`.
- `packages/contracts/scripts/protocol-full-surface.test.ts` — surface-coverage and
  byte-determinism tests.
- `packages/contracts/schema/README.md` — documents the full mode next to the
  existing drift-oracle notes.

## How to run

```sh
bun run --cwd packages/contracts schema:protocol        # Phase-1 GPUI allowlist (unchanged)
bun run --cwd packages/contracts schema:protocol:full   # full WS RPC surface
```

Both accept `--output <path>` to redirect. Full mode writes
`packages/contracts/schema/protocol.v1.full.json` by default.

## Method count

172 methods (169 feature/device/browser plus `bootstrap.negotiate`; the brief's ~170
estimate). Breakdown by group is recorded per method under `"group"`; stream vs unary
under `"kind"`. Tagged error names (e.g. `WsRpcError`,
`PullRequestsUnavailableError`) are sorted per method under `"errors"`.

## Allowlist vs full

- Default mode output is **byte-identical** to
  `luminor/wave-contract-producer`'s committed `protocol.v1.json` (verified with a
  direct diff against the branch blob), so the luminor-gpui vendor ritual
  (`PROTOCOL_SOURCE_SHA` + regenerate + diff) keeps working without changes.
- Full mode reuses the same per-schema export path (`Schema.toJsonSchemaDocument` +
  ref rewriting + key sorting), so both modes share one lossiness profile.

## Reuse of wave-contract-producer work

The exporter base (allowlist rendering, `$defs` rewriting, key sorting, oxfmt
formatting) was taken wholesale from branch `luminor/wave-contract-producer`
(54ca8bceb) rather than rewritten; only the full-surface machinery is new.

## Determinism

All object keys are recursively sorted before serialization and rendered output ends
with exactly one trailing newline; the test asserts two renders are byte-identical.
The committed snapshot can be regenerated in CI and diffed.

## Known lossiness

Unchanged from the allowlist README section: decoding defaults, brands,
refinements, transforms, optional-vs-null nuances are not representable in JSON
Schema; Effect RPC transport frames are library-owned and absent. Two full-mode
specifics worth noting:

- Error *unions* are reduced to their sorted `_tag` sentinel names in `"errors"`;
  the structural union remains available for unary methods under `"error"`, but
  stream methods carry item success/error separately from the library's
  `RpcSchema.Stream` wrapper (`errorSchema` on the Rpc itself is `Never` there).
- Every method embeds its own transitive definitions, so the file is large (~6 MB);
  this buys independently-validatable documents at the cost of duplication.

## Not done here (by design)

- No vendoring into luminor-gpui and no `PROTOCOL_SOURCE_SHA` bump (gpui-side ritual).
- No RPC schema or server behaviour changes; export only.
