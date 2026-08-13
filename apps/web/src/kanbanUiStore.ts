// FILE: kanbanUiStore.ts
// Purpose: Persists kanban control-center UI state (manual draft-card order per project)
//          plus the ephemeral optimistic-dispatch overlay for drag-to-In-Progress drops.
// Layer: UI state store
// Exports: useKanbanUiStore

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  areKanbanBoardFiltersEqual,
  EMPTY_KANBAN_BOARD_FILTERS,
  KANBAN_PR_FILTER_STATES,
  KANBAN_WORK_FILTER_STATES,
  normalizeKanbanBoardFilters,
  type KanbanBoardFilters,
  type KanbanOptimisticDispatchSnapshot,
} from "./components/kanban/kanban.logic";

interface KanbanUiStoreState {
  /** Manual order of draft-column card ids per project, captured after a drag. */
  draftOrderByProjectId: Record<string, string[]>;
  setDraftOrder: (projectId: string, order: readonly string[]) => void;
  clearDraftOrder: (projectId: string) => void;
  boardFilters: KanbanBoardFilters;
  setBoardFilters: (filters: KanbanBoardFilters) => void;
  /**
   * Ephemeral (never persisted): dispatched drops still waiting for their first
   * runtime signal. The board renders these In Progress; reconciliation clears them
   * when runtime state settles, expiry reverts them when it never does.
   */
  optimisticDispatchByThreadId: Record<string, KanbanOptimisticDispatchSnapshot>;
  markOptimisticDispatch: (threadId: string, entry: KanbanOptimisticDispatchSnapshot) => void;
  clearOptimisticDispatch: (threadId: string) => void;
  /** Removes entries dropped at or before cutoffMs; returns them for revert toasts. */
  expireOptimisticDispatches: (
    cutoffMs: number,
  ) => Array<[string, KanbanOptimisticDispatchSnapshot]>;
}

const KANBAN_UI_STORAGE_KEY = "luminor:kanban-ui:v1";
// Stale card ids are harmless (ordering ignores unknown ids) but should not grow unbounded.
const MAX_DRAFT_ORDER_LENGTH = 200;

function sanitizeDraftOrder(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const order: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    order.push(entry);
    if (order.length >= MAX_DRAFT_ORDER_LENGTH) {
      break;
    }
  }
  return order;
}

function sanitizeDraftOrderByProjectId(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const result: Record<string, string[]> = {};
  for (const [projectId, order] of Object.entries(value)) {
    const sanitized = sanitizeDraftOrder(order);
    if (sanitized.length > 0) {
      result[projectId] = sanitized;
    }
  }
  return result;
}

function sanitizeAllowedStrings<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowedSet = new Set(allowed);
  const seen = new Set<T>();
  const result: T[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !allowedSet.has(entry as T) || seen.has(entry as T)) {
      continue;
    }
    seen.add(entry as T);
    result.push(entry as T);
  }
  return result;
}

function sanitizeProjectIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function sanitizeBoardFilters(value: unknown): KanbanBoardFilters {
  if (typeof value !== "object" || value === null) {
    return EMPTY_KANBAN_BOARD_FILTERS;
  }
  const record = value as { prStates?: unknown; workStates?: unknown; projectIds?: unknown };
  return normalizeKanbanBoardFilters({
    prStates: sanitizeAllowedStrings(record.prStates, KANBAN_PR_FILTER_STATES),
    workStates: sanitizeAllowedStrings(record.workStates, KANBAN_WORK_FILTER_STATES),
    projectIds: sanitizeProjectIds(record.projectIds),
  });
}

export const useKanbanUiStore = create<KanbanUiStoreState>()(
  persist(
    (set) => ({
      draftOrderByProjectId: {},
      setDraftOrder: (projectId, order) => {
        if (projectId.length === 0) return;
        set((state) => {
          const sanitized = sanitizeDraftOrder([...order]);
          const current = state.draftOrderByProjectId[projectId];
          if (
            current &&
            current.length === sanitized.length &&
            current.every((cardId, index) => cardId === sanitized[index])
          ) {
            return state;
          }
          return {
            draftOrderByProjectId: {
              ...state.draftOrderByProjectId,
              [projectId]: sanitized,
            },
          };
        });
      },
      clearDraftOrder: (projectId) => {
        set((state) => {
          if (!(projectId in state.draftOrderByProjectId)) {
            return state;
          }
          const next = { ...state.draftOrderByProjectId };
          delete next[projectId];
          return { draftOrderByProjectId: next };
        });
      },
      boardFilters: EMPTY_KANBAN_BOARD_FILTERS,
      setBoardFilters: (filters) => {
        set((state) => {
          const next = normalizeKanbanBoardFilters(filters);
          if (areKanbanBoardFiltersEqual(state.boardFilters, next)) {
            return state;
          }
          return { boardFilters: next };
        });
      },
      optimisticDispatchByThreadId: {},
      markOptimisticDispatch: (threadId, entry) => {
        if (threadId.length === 0) return;
        set((state) => ({
          optimisticDispatchByThreadId: {
            ...state.optimisticDispatchByThreadId,
            [threadId]: entry,
          },
        }));
      },
      clearOptimisticDispatch: (threadId) => {
        set((state) => {
          if (!(threadId in state.optimisticDispatchByThreadId)) {
            return state;
          }
          const next = { ...state.optimisticDispatchByThreadId };
          delete next[threadId];
          return { optimisticDispatchByThreadId: next };
        });
      },
      expireOptimisticDispatches: (cutoffMs) => {
        const expired: Array<[string, KanbanOptimisticDispatchSnapshot]> = [];
        set((state) => {
          const next: Record<string, KanbanOptimisticDispatchSnapshot> = {};
          for (const [threadId, entry] of Object.entries(state.optimisticDispatchByThreadId)) {
            if (entry.droppedAtMs <= cutoffMs) {
              expired.push([threadId, entry]);
            } else {
              next[threadId] = entry;
            }
          }
          return expired.length > 0 ? { optimisticDispatchByThreadId: next } : state;
        });
        return expired;
      },
    }),
    {
      name: KANBAN_UI_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        draftOrderByProjectId: state.draftOrderByProjectId,
        boardFilters: state.boardFilters,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | Partial<Pick<KanbanUiStoreState, "draftOrderByProjectId" | "boardFilters">>
          | undefined;
        return {
          ...currentState,
          draftOrderByProjectId: sanitizeDraftOrderByProjectId(persisted?.draftOrderByProjectId),
          boardFilters: sanitizeBoardFilters(persisted?.boardFilters),
        };
      },
    },
  ),
);
