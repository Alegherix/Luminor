import type { ConnectionStatus } from "../../api/types";
import { strings } from "../../strings";

export function sessionEmptyHint(status: ConnectionStatus): string | null {
  switch (status) {
    case "connecting":
      return strings.sessionsUi.connectingHint;
    case "incompatible":
      return strings.sessionsUi.incompatibleHint;
    case "closed":
      return strings.sessionsUi.disconnectedHint;
    default:
      return null;
  }
}
