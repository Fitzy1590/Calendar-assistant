import type { StateStorage } from "zustand/middleware";

/**
 * The store's save target. Starts as localStorage (browser build, tests, and the instant the module loads);
 * the Tauri app swaps in SQLite in `initStorage.ts` before the first screen is drawn.
 */
const local = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

let backend: StateStorage = {
  getItem: (n) => local()?.getItem(n) ?? null,
  setItem: (n, v) => void local()?.setItem(n, v),
  removeItem: (n) => void local()?.removeItem(n),
};
export const useBackend = (b: StateStorage) => void (backend = b);

/** Delegates so a synchronous localStorage read keeps hydrating the store synchronously. */
export const appStorage: StateStorage = {
  getItem: (n) => backend.getItem(n),
  setItem: (n, v) => backend.setItem(n, v),
  removeItem: (n) => backend.removeItem(n),
};

/** Larger values (the Yjs document) saved beside the store; localStorage when SQLite isn't in use. */
export const blobs = {
  get: async (k: string): Promise<string | null> => local()?.getItem(`blob:${k}`) ?? null,
  set: async (k: string, v: string): Promise<void> => void local()?.setItem(`blob:${k}`, v),
};
export const useBlobs = (b: Pick<typeof blobs, "get" | "set">) => Object.assign(blobs, b);
