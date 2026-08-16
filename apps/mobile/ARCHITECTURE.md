# Luminor Mobile — Foundation API

Task 1 owns `apps/mobile`. Later screen tasks should import from this surface and
not reimplement transport, auth, or the read model.

## Layout

```
apps/mobile/
  app/
    _layout.tsx              # providers + dark stack
    (tabs)/                  # expo-router tab group (Home, Threads, Search, Sessions, Settings)
    workspace/[id].tsx       # placeholder for Task 3
    thread/[id].tsx          # placeholder for Task 5
  src/
    api/                     # transport, auth, RPC, hooks
    state/                   # shell + thread reducers and stores
    theme/tokens.ts
    components/shared/       # reusable chrome
    strings.ts
```

`app/(tabs)/` is required by expo-router so detail routes can live on a stack
above the tab bar. Public route names stay `/`, `/threads`, `/search`,
`/sessions`, `/settings`, `/workspace/[id]`, `/thread/[id]`.

## Hooks

All hooks subscribe to the process-wide `MobileRuntime` singleton via
`useSyncExternalStore`.

### `useConnection()`

```ts
import { useConnection } from "../src/api";

const {
  status, // "connecting" | "open" | "closed" | "incompatible"
  serverInfo, // { baseUrl, serverBuild, serverInstanceId, protocolEpoch, negotiatedRevision, capabilities } | null
  compatibility, // WsCompatibilityError | null
  lastError, // string | null
  paired, // boolean
  serverUrl, // string
  reconnect, // () => void
  disconnect, // () => void
} = useConnection();
```

### `useShell()`

Hydrated from `orchestration.subscribeShell` (snapshot + stream). Thread rows
include locally derived status and unread flags.

```ts
import { useShell } from "../src/api";

const {
  spaces, // readonly OrchestrationSpaceShell[]
  folders, // readonly OrchestrationFolderShell[]
  projects, // readonly OrchestrationProjectShell[]
  threads, // readonly ShellThread[]
  snapshotSequence, // number | null
  hydrated, // boolean
} = useShell();

type ShellThread = OrchestrationThreadShell & {
  status: "active" | "idle" | "running" | "needs-attention";
  unread: boolean;
  needsAttention: boolean;
};
```

Unread uses a phone-local `lastVisitedAt` compared to `latestTurn.completedAt`.
It is not shared with desktop.

### `useThread(threadId)`

Acquires a refcounted `orchestration.subscribeThread` lease for `threadId` and
releases it on unmount. Resume uses `afterSequence` when a coherent cursor exists.

```ts
import { useThread } from "../src/api";

const {
  thread, // OrchestrationThread | null
  messages, // readonly OrchestrationMessage[]
  activities, // readonly OrchestrationThreadActivity[]
  latestTurn, // OrchestrationLatestTurn | null
  pendingInteractions, // open approval/user-input rows
  proposedPlans, // readonly OrchestrationProposedPlan[]
  fileEdits, // readonly OrchestrationCheckpointSummary[]
  session, // OrchestrationSession | null
  status, // ThreadStatusKind
  loading, // boolean
  error, // string | null
  markVisited, // () => void
} = useThread(threadId);
```

Call `markVisited()` when the user opens the thread so unread clears.

## `api` command functions

```ts
import { api, buildTurnStartCommand } from "../src/api";
```

| Function                                                                         | RPC / command                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `api.dispatchCommand(command)`                                                   | `orchestration.dispatchCommand` — payload is a `ClientOrchestrationCommand`                |
| `api.interrupt(threadId, turnId?)`                                               | `thread.turn.interrupt`                                                                    |
| `api.respondToApproval({ threadId, requestId, decision, lifecycleGeneration? })` | `thread.approval.respond` — always send `requestId` and `lifecycleGeneration` when present |
| `api.setModelSelection(threadId, modelSelection)`                                | `thread.meta.update`                                                                       |
| `api.listModels(input)`                                                          | `provider.listModels`                                                                      |

Helpers for building commands (IDs and `createdAt` are generated):

```ts
buildTurnStartCommand({ threadId, text, runtimeMode?, interactionMode?, modelSelection? })
buildInterruptCommand({ threadId, turnId? })
buildApprovalRespondCommand({ threadId, requestId, decision, lifecycleGeneration? })
buildSetModelSelectionCommand({ threadId, modelSelection })
```

## Connection / auth sequence

1. Persist server URL (`normalizeBaseUrl`, Tailnet host:port, optional `http://`).
2. `POST /api/auth/bootstrap/bearer` with `{ credential }` → store `sessionToken` in expo-secure-store.
3. `POST /api/auth/ws-token` with `Authorization: Bearer …` → keep ticket in memory only.
4. `GET /ws/negotiate` with `wsCompatibility` query constants; on transport/404 fall back to `/ws/bootstrap` + `bootstrap.negotiate`.
5. Open one feature socket at `/ws` with negotiated compatibility query plus `wsToken`.
6. Subscribe shell; subscribe selected threads. Reconnect uses
   `delay = min(500 * 2^clamp(attempt,0,16), 5000)` and resnapshots when
   `serverInstanceId` changes.

Terminal compatibility errors (`WS_PROTOCOL_INCOMPATIBLE`,
`WS_CAPABILITIES_INCOMPATIBLE`, `WS_NEGOTIATION_REQUIRED`) set status
`incompatible` and stop automatic retry.

## Shared components

Import from `../src/components/shared`.

| Component        | Props                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| `StatusChip`     | `{ status: ThreadStatusKind }`                                                        |
| `ThreadRow`      | `{ title, subtitle, status, timeLabel?, unreadCount?, onPress? }`                     |
| `IconTile`       | `{ label, backgroundColor?, color?, size? }`                                          |
| `SectionHeader`  | `{ title, trailingLabel?, onPressTrailing? }`                                         |
| `ConnectionPill` | no props — reads `useConnection()`, opens connection sheet                            |
| `ScreenHeader`   | `{ title?, subtitle?, showBrand?, showBack?, showBell?, hasNotifications?, onBack? }` |
| `EmptyState`     | `{ title, body }`                                                                     |
| `Badge`          | `{ count?, dot?, tone?: "accent" \| "purple" }`                                       |

Theme tokens live in `src/theme/tokens.ts`. English copy lives in `src/strings.ts`.
Do not invent mock rows: hide a section when the backing data is empty.

## What Task 1 did not implement

- Home / workspace UI (Task 3)
- Threads tab grouping and Search (Task 4)
- Thread timeline, chat, composer, approvals UI (Task 5)
- Sessions list polish, app icon/splash art beyond a placeholder mark (Task 6)
- Server runbook / Origin allowlist (Task 2)
