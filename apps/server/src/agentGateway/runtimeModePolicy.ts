import type { RuntimeMode } from "@synara/contracts";

const RUNTIME_MODE_PRIVILEGE: Record<RuntimeMode, number> = {
  "approval-required": 0,
  auto: 1,
  "full-access": 2,
};

export function runtimeModeEscalatesPrivilege(
  callerRuntimeMode: RuntimeMode,
  targetRuntimeMode: RuntimeMode,
): boolean {
  return RUNTIME_MODE_PRIVILEGE[targetRuntimeMode] > RUNTIME_MODE_PRIVILEGE[callerRuntimeMode];
}
