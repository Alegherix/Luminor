import type { ExternalMcpCapability, RuntimeMode } from "@synara/contracts";

import { GatewayToolError } from "../agentGateway/toolRuntime.ts";

export interface ExternalMcpRuntimePolicy {
  readonly environment: "local" | "worktree";
  readonly runtimeMode: RuntimeMode;
}

export function resolveExternalMcpRuntimePolicy(input: {
  readonly requestedEnvironment?: "local" | "worktree";
  readonly requestedRuntimeMode?: RuntimeMode;
  readonly capabilities: ReadonlySet<ExternalMcpCapability | string>;
}): ExternalMcpRuntimePolicy {
  const environment = input.requestedEnvironment ?? "worktree";
  const runtimeMode = input.requestedRuntimeMode ?? "approval-required";
  if (runtimeMode === "auto") {
    throw new GatewayToolError(
      "capability_denied",
      "Auto execution is not available to external MCP clients.",
    );
  }
  if (environment === "local" && !input.capabilities.has("runtime:local")) {
    throw new GatewayToolError(
      "capability_denied",
      'Local-checkout execution requires the explicit "runtime:local" scope.',
    );
  }
  if (runtimeMode === "full-access" && !input.capabilities.has("runtime:full-access")) {
    throw new GatewayToolError(
      "capability_denied",
      'Full-access execution requires the explicit "runtime:full-access" scope.',
    );
  }
  return { environment, runtimeMode };
}
