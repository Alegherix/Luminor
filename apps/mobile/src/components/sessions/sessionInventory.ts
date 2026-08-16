export const HOST_TERMINAL_INVENTORY = {
  listSupported: false,
  reason: "no-list-rpc",
} as const;

export function listHostTerminals(): readonly [] {
  return [];
}

export function canRenderHostTerminalRows(): boolean {
  return HOST_TERMINAL_INVENTORY.listSupported && listHostTerminals().length > 0;
}
