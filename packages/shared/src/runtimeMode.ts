import type { ProviderKind, RuntimeMode } from "@synara/contracts";

const AUTO_RUNTIME_MODE_PROVIDERS = new Set<ProviderKind>(["codex", "claudeAgent"]);
const RUNTIME_MODE_PRIVILEGE = {
  "approval-required": 0,
  auto: 1,
  "full-access": 2,
} as const satisfies Record<RuntimeMode, number>;

export function providerSupportsAutoRuntimeMode(provider: ProviderKind): boolean {
  return AUTO_RUNTIME_MODE_PROVIDERS.has(provider);
}

export function unsupportedAutoRuntimeModeMessage(provider: ProviderKind): string {
  return `Provider "${provider}" does not support Auto runtime mode. Auto is available only for Codex and Claude Code.`;
}

export function runtimeModeEscalatesPrivilege(
  callerRuntimeMode: RuntimeMode,
  targetRuntimeMode: RuntimeMode,
): boolean {
  return RUNTIME_MODE_PRIVILEGE[targetRuntimeMode] > RUNTIME_MODE_PRIVILEGE[callerRuntimeMode];
}

export function normalizeRuntimeModeForProvider(
  runtimeMode: RuntimeMode,
  provider: ProviderKind,
): RuntimeMode {
  return runtimeMode === "auto" && !providerSupportsAutoRuntimeMode(provider)
    ? "approval-required"
    : runtimeMode;
}
