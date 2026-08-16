export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const MEMORY_STORE_KEYS = {
  bearerToken: "luminor.auth.bearerToken",
  serverUrl: "luminor.settings.serverUrl",
  lastVisited: "luminor.unread.lastVisitedAt",
} as const;

export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}
