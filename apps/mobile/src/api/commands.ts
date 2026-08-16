import {
  ApprovalRequestId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  DispatchResult,
  ORCHESTRATION_WS_METHODS,
  ProviderInteractionMode,
  ProviderListModelsResult,
  RuntimeMode,
  WS_METHODS,
  type ClientOrchestrationCommand,
  type CommandId,
  type MessageId,
  type ModelSelection,
  type ProviderApprovalDecision,
  type ProviderListModelsInput,
  type ThreadId,
  type TurnId,
} from "@luminor/contracts";
import { Schema } from "effect";

import type { FeatureRpcClient } from "./rpcClient";

export function createCommandId(): CommandId {
  return crypto.randomUUID() as CommandId;
}

export function createMessageId(): MessageId {
  return crypto.randomUUID() as MessageId;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildTurnStartCommand(input: {
  readonly threadId: ThreadId;
  readonly text: string;
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
  readonly modelSelection?: ModelSelection;
}): ClientOrchestrationCommand {
  const command: ClientOrchestrationCommand = {
    type: "thread.turn.start",
    commandId: createCommandId(),
    threadId: input.threadId,
    message: {
      messageId: createMessageId(),
      role: "user",
      text: input.text,
      attachments: [],
    },
    runtimeMode: input.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    interactionMode: input.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
    createdAt: nowIso(),
    ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
  };
  return command;
}

export function buildInterruptCommand(input: {
  readonly threadId: ThreadId;
  readonly turnId?: TurnId;
}): ClientOrchestrationCommand {
  return {
    type: "thread.turn.interrupt",
    commandId: createCommandId(),
    threadId: input.threadId,
    createdAt: nowIso(),
    ...(input.turnId ? { turnId: input.turnId } : {}),
  };
}

export function buildApprovalRespondCommand(input: {
  readonly threadId: ThreadId;
  readonly requestId: string;
  readonly decision: ProviderApprovalDecision;
  readonly lifecycleGeneration?: string;
}): ClientOrchestrationCommand {
  return {
    type: "thread.approval.respond",
    commandId: createCommandId(),
    threadId: input.threadId,
    requestId: input.requestId as typeof ApprovalRequestId.Type,
    decision: input.decision,
    createdAt: nowIso(),
    ...(input.lifecycleGeneration ? { lifecycleGeneration: input.lifecycleGeneration } : {}),
  };
}

export function buildSetModelSelectionCommand(input: {
  readonly threadId: ThreadId;
  readonly modelSelection: ModelSelection;
}): ClientOrchestrationCommand {
  return {
    type: "thread.meta.update",
    commandId: createCommandId(),
    threadId: input.threadId,
    modelSelection: input.modelSelection,
  };
}

export type MobileCommandApi = {
  dispatchCommand(command: ClientOrchestrationCommand): Promise<DispatchResult>;
  interrupt(threadId: ThreadId, turnId?: TurnId): Promise<DispatchResult>;
  respondToApproval(input: {
    readonly threadId: ThreadId;
    readonly requestId: string;
    readonly decision: ProviderApprovalDecision;
    readonly lifecycleGeneration?: string;
  }): Promise<DispatchResult>;
  setModelSelection(threadId: ThreadId, modelSelection: ModelSelection): Promise<DispatchResult>;
  listModels(input: ProviderListModelsInput): Promise<ProviderListModelsResult>;
};

export function createCommandApi(getClient: () => FeatureRpcClient): MobileCommandApi {
  const dispatchCommand = (command: ClientOrchestrationCommand) =>
    getClient().request(ORCHESTRATION_WS_METHODS.dispatchCommand, command, (value) =>
      Schema.decodeUnknownPromise(DispatchResult)(value),
    );

  return {
    dispatchCommand,
    interrupt: (threadId, turnId) =>
      dispatchCommand(buildInterruptCommand({ threadId, ...(turnId ? { turnId } : {}) })),
    respondToApproval: (input) => dispatchCommand(buildApprovalRespondCommand(input)),
    setModelSelection: (threadId, modelSelection) =>
      dispatchCommand(buildSetModelSelectionCommand({ threadId, modelSelection })),
    listModels: (input) =>
      getClient().request(WS_METHODS.providerListModels, input, (value) =>
        Schema.decodeUnknownPromise(ProviderListModelsResult)(value),
      ),
  };
}
