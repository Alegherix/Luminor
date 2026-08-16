import type { ConnectionStatus } from "../../api/types";
import { strings } from "../../strings";
import { colors } from "../../theme/tokens";

export function connectionStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case "open":
      return strings.connection.connected;
    case "connecting":
      return strings.connection.connecting;
    case "incompatible":
      return strings.connection.incompatible;
    default:
      return strings.connection.disconnected;
  }
}

export function connectionStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case "open":
      return colors.success;
    case "connecting":
      return colors.warning;
    case "incompatible":
      return colors.accent;
    default:
      return colors.danger;
  }
}

export function pairingStatusLabel(paired: boolean): string {
  return paired ? strings.connection.paired : strings.connection.notPaired;
}

export function protocolLabel(
  serverInfo: {
    readonly protocolEpoch: number;
    readonly negotiatedRevision: number;
  } | null,
): string {
  if (!serverInfo) return "—";
  return `${serverInfo.protocolEpoch}.${serverInfo.negotiatedRevision}`;
}

export function capabilitiesLabel(capabilities: readonly string[] | undefined): string {
  if (!capabilities || capabilities.length === 0) return strings.settingsUi.none;
  return capabilities.join(", ");
}
