import { isTauri } from "./platform";

/**
 * Secrets (sign-in tokens). In the installed Windows app they go to the Windows Credential Manager through the
 * `secure_store_*` commands (src-tauri/src/secure_store.rs). Anywhere else, or if the command is missing, they
 * stay in this device's localStorage (never synced, never in backups). A value found only in localStorage is
 * moved into the Credential Manager the next time it is read.
 */
const LS = (k: string) => `secret:${k}`;
const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(LS(k));
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(LS(k), v);
    } catch {
      /* storage unavailable */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(LS(k));
    } catch {
      /* storage unavailable */
    }
  },
};

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function secretGet(key: string): Promise<string | null> {
  if (isTauri()) {
    try {
      const v = await invoke<string | null>("secure_store_get", { key });
      if (v) return v;
      const old = ls.get(key);
      if (old) {
        await invoke("secure_store_set", { key, value: old });
        ls.del(key);
        return old;
      }
      return null;
    } catch {
      /* no secure store here: use localStorage */
    }
  }
  return ls.get(key);
}

export async function secretSet(key: string, value: string): Promise<void> {
  if (isTauri()) {
    try {
      await invoke("secure_store_set", { key, value });
      ls.del(key);
      return;
    } catch {
      /* fall through */
    }
  }
  ls.set(key, value);
}

export async function secretDelete(key: string): Promise<void> {
  if (isTauri()) await invoke("secure_store_delete", { key }).catch(() => {});
  ls.del(key);
}
