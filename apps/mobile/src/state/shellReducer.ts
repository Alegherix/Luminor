import type {
  OrchestrationFolderShell,
  OrchestrationProjectShell,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamItem,
  OrchestrationSpaceShell,
  OrchestrationThreadShell,
} from "@luminor/contracts";

export type ShellState = {
  readonly snapshotSequence: number | null;
  readonly spaces: readonly OrchestrationSpaceShell[];
  readonly folders: readonly OrchestrationFolderShell[];
  readonly projects: readonly OrchestrationProjectShell[];
  readonly threads: readonly OrchestrationThreadShell[];
  readonly updatedAt: string | null;
  readonly hydrated: boolean;
};

export const emptyShellState: ShellState = {
  snapshotSequence: null,
  spaces: [],
  folders: [],
  projects: [],
  threads: [],
  updatedAt: null,
  hydrated: false,
};

function upsertById<T extends { readonly id: string }>(items: readonly T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];
  return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function removeById<T extends { readonly id: string }>(items: readonly T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

export function applyShellSnapshot(snapshot: OrchestrationShellSnapshot): ShellState {
  return {
    snapshotSequence: snapshot.snapshotSequence,
    spaces: snapshot.spaces,
    folders: snapshot.folders,
    projects: snapshot.projects,
    threads: snapshot.threads,
    updatedAt: snapshot.updatedAt,
    hydrated: true,
  };
}

export function applyShellStreamItem(
  state: ShellState,
  item: OrchestrationShellStreamItem,
): ShellState {
  if (item.kind === "snapshot") {
    return applyShellSnapshot(item.snapshot);
  }
  if (state.snapshotSequence !== null && item.sequence <= state.snapshotSequence) {
    return state;
  }
  const snapshotSequence = item.sequence;
  switch (item.kind) {
    case "space-upserted":
      return { ...state, snapshotSequence, spaces: upsertById(state.spaces, item.space) };
    case "space-removed":
      return { ...state, snapshotSequence, spaces: removeById(state.spaces, item.spaceId) };
    case "space-order-updated": {
      const byId = new Map(state.spaces.map((space) => [space.id, space]));
      const ordered = item.orderedSpaceIds.flatMap((id) => {
        const space = byId.get(id);
        return space ? [space] : [];
      });
      for (const space of state.spaces) {
        if (!item.orderedSpaceIds.includes(space.id)) ordered.push(space);
      }
      return { ...state, snapshotSequence, spaces: ordered };
    }
    case "folder-upserted":
      return { ...state, snapshotSequence, folders: upsertById(state.folders, item.folder) };
    case "folder-removed":
      return { ...state, snapshotSequence, folders: removeById(state.folders, item.folderId) };
    case "project-upserted":
      return { ...state, snapshotSequence, projects: upsertById(state.projects, item.project) };
    case "project-removed":
      return { ...state, snapshotSequence, projects: removeById(state.projects, item.projectId) };
    case "thread-upserted":
      return { ...state, snapshotSequence, threads: upsertById(state.threads, item.thread) };
    case "thread-removed":
      return { ...state, snapshotSequence, threads: removeById(state.threads, item.threadId) };
    default:
      return { ...state, snapshotSequence };
  }
}
