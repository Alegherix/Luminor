import type {
  OrchestrationCheckpointSummary,
  OrchestrationFolderShell,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationPendingInteraction,
  OrchestrationProjectShell,
  OrchestrationProposedPlan,
  OrchestrationSession,
  OrchestrationSpaceShell,
  OrchestrationThread,
  OrchestrationThreadActivity,
  OrchestrationThreadShell,
  WsBootstrapNegotiateResult,
  WsCompatibilityError,
} from "@luminor/contracts";

import type { ThreadStatusKind } from "../state/threadStatus";

export type ConnectionStatus = "connecting" | "open" | "closed" | "incompatible";

export type ServerInfo = {
  readonly baseUrl: string;
  readonly serverBuild: string;
  readonly serverInstanceId: string;
  readonly protocolEpoch: number;
  readonly negotiatedRevision: number;
  readonly capabilities: readonly string[];
};

export type ConnectionSnapshot = {
  readonly status: ConnectionStatus;
  readonly serverInfo: ServerInfo | null;
  readonly compatibility: WsCompatibilityError | null;
  readonly lastError: string | null;
  readonly paired: boolean;
  readonly serverUrl: string;
};

export type ShellThread = OrchestrationThreadShell & {
  readonly status: ThreadStatusKind;
  readonly unread: boolean;
  readonly needsAttention: boolean;
};

export type ShellSnapshot = {
  readonly spaces: readonly OrchestrationSpaceShell[];
  readonly folders: readonly OrchestrationFolderShell[];
  readonly projects: readonly OrchestrationProjectShell[];
  readonly threads: readonly ShellThread[];
  readonly snapshotSequence: number | null;
  readonly hydrated: boolean;
};

export type ThreadSnapshot = {
  readonly thread: OrchestrationThread | null;
  readonly messages: readonly OrchestrationMessage[];
  readonly activities: readonly OrchestrationThreadActivity[];
  readonly latestTurn: OrchestrationLatestTurn | null;
  readonly pendingInteractions: readonly OrchestrationPendingInteraction[];
  readonly proposedPlans: readonly OrchestrationProposedPlan[];
  readonly fileEdits: readonly OrchestrationCheckpointSummary[];
  readonly session: OrchestrationSession | null;
  readonly status: ThreadStatusKind;
  readonly loading: boolean;
  readonly error: string | null;
};

export type CompatibilityNegotiation = WsBootstrapNegotiateResult;
