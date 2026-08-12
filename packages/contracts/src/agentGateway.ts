/**
 * Public contracts for the Luminor agent-control gateway.
 *
 * New gateway tools decode these schemas before doing any work. Keeping the
 * limits here ensures the MCP surface, server implementation, and tests share
 * the same definition of an exact creation/wait plan.
 */
import { Schema } from "effect";

import { ProjectId, ThreadId, TurnId } from "./baseSchemas";
import { ModelSelection, ProviderKind } from "./orchestration";
import { ProviderModelDescriptor } from "./providerDiscovery";
import { ServerProviderAuthStatus } from "./server";

export const LUMINOR_GATEWAY_MAX_THREADS_PER_OPERATION = 20;
export const LUMINOR_GATEWAY_MAX_THREADS_PER_TURN = 20;
export const LUMINOR_GATEWAY_MAX_REQUEST_ID_LENGTH = 256;
export const LUMINOR_GATEWAY_MAX_WAIT_MS = 60_000;

export const LuminorGatewayErrorCode = Schema.Literals([
  "caller_session_inactive",
  "caller_turn_inactive",
  "capability_denied",
  "provider_unavailable",
  "model_unavailable",
  "model_option_unavailable",
  "idempotency_conflict",
  "creation_plan_locked",
  "creation_limit_exceeded",
  "thread_not_found",
  "wait_timed_out",
  "operation_failed",
]);
export type LuminorGatewayErrorCode = typeof LuminorGatewayErrorCode.Type;

export const LuminorGatewayError = Schema.Struct({
  code: LuminorGatewayErrorCode,
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
});
export type LuminorGatewayError = typeof LuminorGatewayError.Type;

export const LuminorGatewayErrorResult = Schema.Struct({
  error: LuminorGatewayError,
});
export type LuminorGatewayErrorResult = typeof LuminorGatewayErrorResult.Type;

export const LuminorContextResult = Schema.Struct({
  harness: Schema.Struct({
    name: Schema.Literal("Luminor"),
    policyVersion: Schema.String,
  }),
  caller: Schema.Struct({
    threadId: ThreadId,
    turnId: Schema.NullOr(TurnId),
    provider: ProviderKind,
    projectId: ProjectId,
  }),
  capabilities: Schema.Struct({
    threadRead: Schema.Boolean,
    threadCreate: Schema.Boolean,
    threadWait: Schema.Boolean,
    automations: Schema.Boolean,
  }),
});
export type LuminorContextResult = typeof LuminorContextResult.Type;

export const LuminorCreateThreadSpec = Schema.Struct({
  prompt: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  target: ModelSelection,
  projectId: Schema.optional(ProjectId),
  environment: Schema.optional(Schema.Literals(["local", "worktree"])),
  baseRef: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  // Legacy inputs remain decodable for replay/backward compatibility, but the
  // MCP catalog no longer advertises branch-backed worktree creation.
  baseBranch: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  branchName: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  runtimeMode: Schema.optional(Schema.Literals(["approval-required", "full-access"])),
});
export type LuminorCreateThreadSpec = typeof LuminorCreateThreadSpec.Type;

const LuminorGatewayRequestId = Schema.String.check(Schema.isNonEmpty()).check(
  Schema.isMaxLength(LUMINOR_GATEWAY_MAX_REQUEST_ID_LENGTH),
);

export const LuminorCreateThreadsInput = Schema.Struct({
  requestId: LuminorGatewayRequestId,
  threads: Schema.Array(LuminorCreateThreadSpec)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(LUMINOR_GATEWAY_MAX_THREADS_PER_OPERATION)),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type LuminorCreateThreadsInput = typeof LuminorCreateThreadsInput.Type;

export const LuminorProviderCatalog = Schema.Struct({
  provider: ProviderKind,
  defaultModel: Schema.NullOr(Schema.String),
  models: Schema.Array(ProviderModelDescriptor),
  enabled: Schema.Boolean,
  available: Schema.Boolean,
  authStatus: Schema.optional(ServerProviderAuthStatus),
  source: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type LuminorProviderCatalog = typeof LuminorProviderCatalog.Type;

export const LuminorGatewayTargetOptionValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
]);
export type LuminorGatewayTargetOptionValue = typeof LuminorGatewayTargetOptionValue.Type;

export const LuminorGatewayTargetOptionRule = Schema.Struct({
  key: Schema.String,
  valueType: Schema.Literals(["string", "number", "boolean"]),
  allowedValues: Schema.Array(LuminorGatewayTargetOptionValue),
  allowedValuesSource: Schema.Literals(["provider-contract", "model-discovery"]),
});
export type LuminorGatewayTargetOptionRule = typeof LuminorGatewayTargetOptionRule.Type;

export const LuminorGatewayTargetConstruction = Schema.Struct({
  modelValueSource: Schema.Literal("providers[].models[].slug"),
  primaryOptionKey: Schema.String,
  alternativeOptionKeys: Schema.Array(Schema.String),
  optionSelectionRule: Schema.String,
  providerOptions: Schema.Array(LuminorGatewayTargetOptionRule),
  optionsByModel: Schema.Record(Schema.String, Schema.Array(LuminorGatewayTargetOptionRule)),
  exampleTarget: Schema.NullOr(ModelSelection),
});
export type LuminorGatewayTargetConstruction = typeof LuminorGatewayTargetConstruction.Type;

export const LuminorCapabilitiesResult = Schema.Struct({
  targetConstruction: Schema.Record(Schema.String, LuminorGatewayTargetConstruction),
  providers: Schema.Array(LuminorProviderCatalog),
  limits: Schema.Struct({
    maxThreadsPerOperation: Schema.Int,
    maxThreadsPerTurn: Schema.Int,
    maxWaitMs: Schema.Int,
    oneCreationPlanPerActiveTurn: Schema.Boolean,
    oneInFlightCreationPlanPerActiveTurn: Schema.Boolean,
  }),
});
export type LuminorCapabilitiesResult = typeof LuminorCapabilitiesResult.Type;

export const LuminorCreatedThreadResult = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  target: ModelSelection,
  provider: ProviderKind,
  model: Schema.String,
  runtimeMode: Schema.Literals(["approval-required", "full-access"]),
  environment: Schema.Literals(["local", "worktree"]),
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  status: Schema.Literal("task_dispatched"),
});
export type LuminorCreatedThreadResult = typeof LuminorCreatedThreadResult.Type;

export const LuminorCreateThreadsResult = Schema.Struct({
  operationId: Schema.String,
  requestId: LuminorGatewayRequestId,
  requestedCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  createdCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  threadIds: Schema.Array(ThreadId),
  threads: Schema.Array(LuminorCreatedThreadResult),
});
export type LuminorCreateThreadsResult = typeof LuminorCreateThreadsResult.Type;

export const LuminorWaitForThreadsInput = Schema.Struct({
  threadIds: Schema.Array(ThreadId)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(LUMINOR_GATEWAY_MAX_THREADS_PER_OPERATION)),
  runIds: Schema.optional(
    Schema.Array(Schema.NullOr(TurnId)).check(
      Schema.isMaxLength(LUMINOR_GATEWAY_MAX_THREADS_PER_OPERATION),
    ),
  ),
  timeoutMs: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(LUMINOR_GATEWAY_MAX_WAIT_MS),
    ),
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type LuminorWaitForThreadsInput = typeof LuminorWaitForThreadsInput.Type;

export const LuminorWaitedThreadResult = Schema.Struct({
  threadId: ThreadId,
  runId: Schema.NullOr(TurnId),
  state: Schema.Literals(["idle", "pending", "running", "completed", "error", "interrupted"]),
  terminal: Schema.Boolean,
  timedOut: Schema.Boolean,
  summary: Schema.NullOr(Schema.String),
  summaryTruncated: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  readThread: Schema.Struct({
    tool: Schema.Literal("luminor_read_thread"),
    arguments: Schema.Struct({ threadId: ThreadId }),
  }),
});
export type LuminorWaitedThreadResult = typeof LuminorWaitedThreadResult.Type;

export const LuminorWaitForThreadsResult = Schema.Struct({
  callerThreadId: ThreadId,
  runIds: Schema.Array(Schema.NullOr(TurnId)),
  allTerminal: Schema.Boolean,
  timedOut: Schema.Boolean,
  threads: Schema.Array(LuminorWaitedThreadResult),
});
export type LuminorWaitForThreadsResult = typeof LuminorWaitForThreadsResult.Type;
