# GPUI protocol drift oracle

`protocol.v1.json` is the named Effect Schema allowlist consumed by the Luminor GPUI port.
Regenerate it from the repository root with:

```sh
bun run --cwd packages/contracts schema:protocol
```

The allowlist covers negotiation, compatibility and RPC errors, the shell and thread-detail
snapshots and stream items, the orchestration event union, the Wave 4 command subset,
`OrchestrationSession`, and `ModelSelection`.

## Full surface (`protocol.v1.full.json`)

`--full` dumps every WS RPC method across all four groups (feature, device, browser pane,
bootstrap) instead of the GPUI allowlist:

```sh
bun run --cwd packages/contracts schema:protocol:full
```

Each entry in `methods` carries the method tag, its group, `kind` (`unary` or `stream`),
the sorted tagged error names, and standalone payload/success (and for unary methods,
error) JSON Schema documents with per-method rewritten `$defs`. Output keys are fully
sorted and an `x-luminor-effect-pin` records the Effect catalog pin, so consecutive runs
are byte-identical and CI can diff the committed snapshot. The file is large (~6 MB)
because every method embeds its own transitive definitions; that duplication is accepted
in exchange for documents that can be validated independently.

## Known losses

This file is a drift oracle, not a source-code generator. JSON Schema does not preserve all
Effect Schema semantics, including decoding defaults, brands, transformations, refinements,
and some optional-vs-null behavior. The open `activity.kind`/payload contract remains open.
The Effect RPC `_tag` transport frames are library-owned values rather than contract schemas,
so they are deliberately absent. Large unions and the protocol's separate `_tag` and `type`
discriminators are also poor code-generation inputs.

Keep the hand-written Rust serde types and the recorded wire corpus authoritative. A schema
diff is a prompt to inspect and re-record the wire contract, not proof that generated Rust is
compatible.

## `PROTOCOL_SOURCE_SHA`

The GPUI repository owns `PROTOCOL_SOURCE_SHA` and must pin it to the exact Luminor producer
commit being vendored. A commit cannot embed its own final SHA without changing that SHA, so
the schema intentionally contains no self-referential revision field. The GPUI drift job should:

1. clone Luminor at `PROTOCOL_SOURCE_SHA`;
2. run `bun run --cwd packages/contracts schema:protocol`;
3. diff `packages/contracts/schema/protocol.v1.json` against the vendored copy.

Do not make that private-repository clone a required Luminor CI check without credentials.

## Corpus recorder

Run this proxy against an already-running desktop backend; it does not start or supervise one:

```sh
bun run --cwd packages/contracts corpus:record -- \
  --target ws://127.0.0.1:56001 \
  --listen ws://127.0.0.1:58101 \
  --output /path/to/luminor-gpui/fixtures/corpus/shell-populated.ndjson
```

Point GPUI at the printed proxy URL, exercise exactly one scenario, and stop with Ctrl-C. Each
line is `{dir,t_ms,frame}` with `dir` equal to `c2s` or `s2c`. The first recorded wire line also
has a `source` object containing `PROTOCOL_SOURCE_SHA` and the exact catalog `EFFECT_PIN`. The
recorder embeds the original JSON text directly as `frame`, without normalizing the wire object.
