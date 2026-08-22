/**
 * Export the deliberately small GPUI protocol allowlist as draft 2020-12 JSON Schema.
 *
 * This is a drift oracle, not a Rust code generator. Effect decoding defaults,
 * branded values, refinements, transforms, optional-vs-null behavior, open
 * activity payloads, and the library-owned Effect RPC frame codec are lossy or
 * absent in JSON Schema. See ../schema/README.md before consuming the output.
 *
 * `--full` exports every WS RPC method surface (feature, device, browser pane and
 * bootstrap groups) instead of the GPUI allowlist. See ../schema/README.md.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Schema } from "effect";
import type * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcSchema from "effect/unstable/rpc/RpcSchema";

import {
  ClientOrchestrationCommand,
  ModelSelection,
  OrchestrationEvent,
  OrchestrationSession,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamItem,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadStreamItem,
} from "../src/orchestration";
import {
  WsBootstrapRpcGroup,
  WsBrowserPaneRpcGroup,
  WsDeviceRpcGroup,
  WsFeatureRpcGroup,
  WsRpcError,
} from "../src/rpc";
import {
  WsBootstrapNegotiateInput,
  WsBootstrapNegotiateResult,
  WsCompatibilityError,
} from "../src/wsCompatibility";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const PROTOCOL_SCHEMA_PATH = resolve(
  REPOSITORY_ROOT,
  "packages/contracts/schema/protocol.v1.json",
);

export const FULL_PROTOCOL_SCHEMA_PATH = resolve(
  REPOSITORY_ROOT,
  "packages/contracts/schema/protocol.v1.full.json",
);

const SCHEMAS = [
  ["WsBootstrapNegotiateInput", WsBootstrapNegotiateInput],
  ["WsBootstrapNegotiateResult", WsBootstrapNegotiateResult],
  ["WsCompatibilityError", WsCompatibilityError],
  ["OrchestrationShellSnapshot", OrchestrationShellSnapshot],
  ["OrchestrationShellStreamItem", OrchestrationShellStreamItem],
  ["OrchestrationThreadDetailSnapshot", OrchestrationThreadDetailSnapshot],
  ["OrchestrationThreadStreamItem", OrchestrationThreadStreamItem],
  ["OrchestrationEvent", OrchestrationEvent],
  ["GpuiClientOrchestrationCommand", ClientOrchestrationCommand],
  ["OrchestrationSession", OrchestrationSession],
  ["ModelSelection", ModelSelection],
  ["WsRpcError", WsRpcError],
] as const;

export const GPUI_COMMAND_TYPES = [
  "folder.create",
  "folder.rename",
  "folder.pin",
  "project.create",
  "thread.create",
  "thread.delete",
  "thread.archive",
  "thread.meta.update",
  "thread.turn.start",
  "thread.turn.interrupt",
  "thread.approval.respond",
  "thread.user-input.respond",
] as const;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function escapeJsonPointerToken(token: string): string {
  return token.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function rewriteLocalDefinitionRefs(value: JsonValue, defsBasePointer: string): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteLocalDefinitionRefs(item, defsBasePointer));
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && value.startsWith("#/$defs/")) {
      return `#/${defsBasePointer}/$defs/${value.slice("#/$defs/".length)}`;
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      rewriteLocalDefinitionRefs(item, defsBasePointer),
    ]),
  );
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}

async function readEffectPin(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(resolve(REPOSITORY_ROOT, "package.json"), "utf8"),
  ) as { workspaces?: { catalog?: { effect?: string } } };
  const pin = packageJson.workspaces?.catalog?.effect;
  if (!pin) {
    throw new Error("The root package.json does not define workspaces.catalog.effect");
  }
  return pin;
}

function commandType(schema: JsonValue): string | undefined {
  if (schema === null || Array.isArray(schema) || typeof schema !== "object") return undefined;
  const properties = schema.properties;
  if (properties === null || Array.isArray(properties) || typeof properties !== "object") {
    return undefined;
  }
  const type = properties.type;
  if (type === null || Array.isArray(type) || typeof type !== "object") return undefined;
  const values = type.enum;
  return Array.isArray(values) && typeof values[0] === "string" ? values[0] : undefined;
}

function selectGpuiCommands(schema: JsonValue): JsonValue {
  if (schema === null || Array.isArray(schema) || typeof schema !== "object") {
    throw new Error("ClientOrchestrationCommand did not export as an object schema");
  }
  const variants = schema.anyOf;
  if (!Array.isArray(variants)) {
    throw new Error("ClientOrchestrationCommand did not export an anyOf command union");
  }
  const allowlist = new Set<string>(GPUI_COMMAND_TYPES);
  const selected = variants.filter((variant) => {
    const type = commandType(variant);
    return type !== undefined && allowlist.has(type);
  });
  const found = new Set(selected.map(commandType).filter((type) => type !== undefined));
  const missing = GPUI_COMMAND_TYPES.filter((type) => !found.has(type));
  if (missing.length > 0) {
    throw new Error(
      `Command schemas missing from ClientOrchestrationCommand: ${missing.join(", ")}`,
    );
  }
  return { ...schema, anyOf: selected };
}

function exportEmbeddedDefinition(
  name: string,
  schema: Schema.Top,
  defsBasePointer: string,
): JsonValue {
  const document = Schema.toJsonSchemaDocument(schema, { additionalProperties: false });
  const rootSchema =
    name === "GpuiClientOrchestrationCommand"
      ? selectGpuiCommands(document.schema as JsonValue)
      : (document.schema as JsonValue);
  const standalone = {
    ...(rootSchema as { [key: string]: JsonValue }),
    ...(Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {}),
  } as JsonValue;
  return rewriteLocalDefinitionRefs(standalone, defsBasePointer);
}

function exportDefinition(name: string, schema: Schema.Top): JsonValue {
  return exportEmbeddedDefinition(name, schema, ["$defs", escapeJsonPointerToken(name)].join("/"));
}

export async function renderProtocolSchema(): Promise<string> {
  const effectPin = await readEffectPin();
  const definitions = Object.fromEntries(
    SCHEMAS.map(([name, schema]) => [name, exportDefinition(name, schema)]),
  );
  const output = sortJson({
    $comment:
      "Drift oracle only. Keep the hand-written Rust protocol types and recorded wire corpus authoritative.",
    $defs: definitions,
    $id: "https://luminor.dev/schema/protocol.v1.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Luminor GPUI protocol allowlist",
    "x-luminor-effect-pin": effectPin,
    "x-luminor-gpui-command-types": [...GPUI_COMMAND_TYPES],
    "x-luminor-schema-names": SCHEMAS.map(([name]) => name),
  });
  return `${JSON.stringify(output, null, 2)}\n`;
}

async function formatJson(outputPath: string): Promise<void> {
  const formatter = spawn(resolve(REPOSITORY_ROOT, "node_modules/.bin/oxfmt"), [outputPath], {
    cwd: REPOSITORY_ROOT,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  formatter.stderr.setEncoding("utf8");
  formatter.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    formatter.on("error", reject);
    formatter.on("close", resolveExit);
  });
  if (exitCode !== 0) {
    throw new Error(`Could not format ${outputPath}: ${stderr.trim()}`);
  }
}

export async function exportProtocolSchema(outputPath = PROTOCOL_SCHEMA_PATH): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await renderProtocolSchema(), "utf8");
  await formatJson(outputPath);
}

type RpcLike = typeof Rpc.Any;

const FULL_SURFACE_GROUPS: ReadonlyArray<readonly [string, { requests: Map<string, RpcLike> }]> = [
  ["feature", WsFeatureRpcGroup],
  ["device", WsDeviceRpcGroup],
  ["browser", WsBrowserPaneRpcGroup],
  ["bootstrap", WsBootstrapRpcGroup],
];

function collectTaggedErrorNames(ast: unknown): Set<string> {
  const names = new Set<string>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const record = node as { annotations?: unknown; [key: string]: unknown };
    if (record.annotations && typeof record.annotations === "object") {
      const sentinels = (record.annotations as Record<string, unknown>)["~sentinels"];
      if (Array.isArray(sentinels)) {
        for (const sentinel of sentinels) {
          if (
            sentinel &&
            typeof sentinel === "object" &&
            (sentinel as Record<string, unknown>).key === "_tag" &&
            typeof (sentinel as Record<string, unknown>).literal === "string"
          ) {
            names.add((sentinel as Record<string, unknown>).literal as string);
          }
        }
      }
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  visit(ast);
  return names;
}

function fullSurfaceMethod(groupName: string, rpc: RpcLike): JsonValue {
  const streamSchemas = RpcSchema.getStreamSchemas(rpc.successSchema as Schema.Top);
  const kind = streamSchemas ? "stream" : "unary";
  const successSchema = streamSchemas ? streamSchemas.success : (rpc.successSchema as Schema.Top);
  const errorSource = streamSchemas ? streamSchemas.error : (rpc.errorSchema as Schema.Top);
  const taggedErrorNames = [...collectTaggedErrorNames(errorSource.ast)].sort();
  const methodPointer = ["methods", escapeJsonPointerToken(rpc._tag)]
    .join("/");
  const slotDefinition = (slot: "error" | "payload" | "success", schema: Schema.Top): JsonValue =>
    exportEmbeddedDefinition(`${rpc._tag}.${slot}`, schema, `${methodPointer}/${slot}`);
  return sortJson({
    errors: taggedErrorNames,
    group: groupName,
    kind,
    payload: slotDefinition("payload", rpc.payloadSchema as Schema.Top),
    success: slotDefinition("success", successSchema),
    error: slotDefinition("error", errorSource),
  } as Record<string, JsonValue>);
}

export function buildFullProtocolSurface(): { methodCount: number; methods: Record<string, JsonValue> } {
  const methods: Record<string, JsonValue> = {};
  let methodCount = 0;
  for (const [groupName, group] of FULL_SURFACE_GROUPS) {
    for (const [tag, rpc] of group.requests) {
      if (tag in methods) {
        throw new Error(`Duplicate RPC method tag across groups: ${tag}`);
      }
      methods[tag] = fullSurfaceMethod(groupName, rpc);
      methodCount += 1;
    }
  }
  return { methodCount, methods };
}

export async function renderFullProtocolSchema(): Promise<string> {
  const effectPin = await readEffectPin();
  const { methodCount, methods } = buildFullProtocolSurface();
  const output = sortJson({
    $comment:
      "Full-surface drift oracle. Keep the hand-written protocol types authoritative; see README.md for known JSON Schema losses.",
    $id: "https://luminor.dev/schema/protocol.v1.full.json",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Luminor WS RPC full surface",
    "x-luminor-effect-pin": effectPin,
    "x-luminor-method-count": methodCount,
    methods,
  });
  return `${JSON.stringify(output, null, 2)}\n`;
}

export async function exportFullProtocolSchema(
  outputPath = FULL_PROTOCOL_SCHEMA_PATH,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await renderFullProtocolSchema(), "utf8");
  await formatJson(outputPath);
}

function outputPathFromArgs(args: readonly string[], isFull: boolean): string {
  const outputIndex = args.indexOf("--output");
  if (outputIndex === -1) {
    return isFull ? FULL_PROTOCOL_SCHEMA_PATH : PROTOCOL_SCHEMA_PATH;
  }
  const output = args[outputIndex + 1];
  if (!output) {
    throw new Error("--output requires a path");
  }
  return resolve(output);
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const isFull = args.includes("--full");
  const outputPath = outputPathFromArgs(args, isFull);
  if (isFull) {
    await exportFullProtocolSchema(outputPath);
  } else {
    await exportProtocolSchema(outputPath);
  }
  console.log(`Wrote ${outputPath}`);
}
