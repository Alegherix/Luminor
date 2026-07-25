import type { ProviderKind, RuntimeMode } from "@synara/contracts";

const SUPPORTED_RUNTIME_MODES_BY_PROVIDER = {
  codex: ["approval-required", "auto", "full-access"],
  claudeAgent: ["approval-required", "auto", "full-access"],
  antigravity: ["full-access"],
  cursor: ["approval-required", "full-access"],
  grok: ["approval-required", "full-access"],
  droid: ["approval-required", "full-access"],
  kilo: ["approval-required", "full-access"],
  opencode: ["approval-required", "full-access"],
  pi: ["approval-required", "full-access"],
} as const satisfies Record<ProviderKind, ReadonlyArray<RuntimeMode>>;

const RUNTIME_MODE_PRIVILEGE = {
  "approval-required": 0,
  auto: 1,
  "full-access": 2,
} as const satisfies Record<RuntimeMode, number>;

export function supportedRuntimeModesForProvider(
  provider: ProviderKind,
): ReadonlyArray<RuntimeMode> {
  return SUPPORTED_RUNTIME_MODES_BY_PROVIDER[provider];
}

export function providerSupportsRuntimeMode(
  provider: ProviderKind,
  runtimeMode: RuntimeMode,
): boolean {
  return supportedRuntimeModesForProvider(provider).includes(runtimeMode);
}

export function providerSupportsAutoRuntimeMode(provider: ProviderKind): boolean {
  return providerSupportsRuntimeMode(provider, "auto");
}

export function runtimeModeCompatibilityMessage(
  provider: ProviderKind,
  runtimeMode: RuntimeMode,
): string {
  const supported = supportedRuntimeModesForProvider(provider)
    .map((mode) => `"${mode}"`)
    .join(", ");
  return `Provider "${provider}" does not support runtime mode "${runtimeMode}". Supported modes: ${supported}.`;
}

export function normalizeRuntimeModeForProvider(
  runtimeMode: RuntimeMode,
  provider: ProviderKind,
): RuntimeMode {
  if (providerSupportsRuntimeMode(provider, runtimeMode)) {
    return runtimeMode;
  }
  const currentPrivilege = RUNTIME_MODE_PRIVILEGE[runtimeMode];
  const safeFallbacks = supportedRuntimeModesForProvider(provider).filter(
    (candidate) => RUNTIME_MODE_PRIVILEGE[candidate] <= currentPrivilege,
  );
  return safeFallbacks.at(-1) ?? runtimeMode;
}
