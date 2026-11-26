import type { StateStorage } from "zustand/middleware";

/** The two calls this layer needs; `@tauri-apps/plugin-sql` and `node:sqlite` (tests) both fit behind it. Use `?` placeholders. */
export interface SqlDb {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** Collections stored one row per record. Names are fixed constants, never user input. */
export const COLLECTIONS = ["events", "tasks", "contacts", "notes", "shopping", "prefs", "feedback"] as const;
const KV_KEYS = ["deviceId", "settings", "dismissedReminders", "snoozedReminders", "lastSyncSeq"] as const;

/**
 * Zustand storage backed by SQLite: a table per collection (id, updated_at, deleted, data JSON) and a `kv` table for
 * settings and counters. Only rows that changed are written. `legacy` supplies the old single-blob save so the
 * first run migrates it; the old blob is never deleted.
 */
export function sqliteStorage(db: SqlDb, legacy: () => string | null = () => null, onError: (e: unknown) => void = console.error) {
  const written = new Map<string, string>(); // "table:id" -> JSON last written
  let loaded = false;
  let latest: string | null = null;
  let chain: Promise<void> = Promise.resolve();

  const init = async () => {
    for (const c of COLLECTIONS)
      await db.execute(
        `CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL)`,
      );
    await db.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    await db.execute("CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  };
  const ready = init();

  const put = async (table: string, key: string, json: string, sql: string, params: unknown[]) => {
    if (written.get(`${table}:${key}`) === json) return;
    await db.execute(sql, params);
    written.set(`${table}:${key}`, json);
  };

  async function write(raw: string) {
    const { state, version } = JSON.parse(raw) as { state: Record<string, unknown>; version?: number };
    for (const c of COLLECTIONS) {
      const recs = (state[c] ?? {}) as Record<string, { updatedAt?: number; deleted?: boolean }>;
      for (const [id, rec] of Object.entries(recs)) {
        const json = JSON.stringify(rec);
        await put(c, id, json, `INSERT OR REPLACE INTO ${c} (id, updated_at, deleted, data) VALUES (?, ?, ?, ?)`, [
          id,
          rec.updatedAt ?? 0,
          rec.deleted ? 1 : 0,
          json,
        ]);
      }
      for (const key of [...written.keys()]) {
        if (!key.startsWith(`${c}:`)) continue;
        const id = key.slice(c.length + 1);
        if (!(id in recs)) {
          await db.execute(`DELETE FROM ${c} WHERE id = ?`, [id]);
          written.delete(key);
        }
      }
    }
    for (const k of KV_KEYS) {
      if (state[k] === undefined) continue;
      const json = JSON.stringify(state[k]);
      await put("kv", k, json, "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [k, json]);
    }
    const v = String(version ?? 1);
    await put("kv", "version", v, "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", ["version", v]);
  }

  const storage: StateStorage = {
    async getItem() {
      await ready;
      const state: Record<string, unknown> = {};
      for (const c of COLLECTIONS) {
        const out: Record<string, unknown> = {};
        for (const row of await db.select<{ id: string; data: string }>(`SELECT id, data FROM ${c}`)) {
          try {
            out[row.id] = JSON.parse(row.data);
            written.set(`${c}:${row.id}`, row.data);
          } catch {
            /* one damaged row must not block the rest */
          }
        }
        state[c] = out;
      }
      const kv = await db.select<{ key: string; value: string }>("SELECT key, value FROM kv");
      for (const { key, value } of kv) {
        if ((KV_KEYS as readonly string[]).includes(key)) {
          try {
            state[key] = JSON.parse(value);
            written.set(`kv:${key}`, value);
          } catch {
            /* skip */
          }
        }
      }
      const version = kv.find((r) => r.key === "version")?.value;
      loaded = true;
      if (!version) return legacy(); // first run on SQLite: hand back the old save, the next write fills the tables
      return JSON.stringify({ state, version: Number(version) });
    },
    setItem(_name, value) {
      if (!loaded) return; // never write before the first read, or empty defaults could wipe the tables
      latest = value;
      chain = chain
        .then(async () => {
          if (latest === null) return;
          const v = latest;
          latest = null;
          await write(v);
        })
        .catch(onError);
      return chain;
    },
    removeItem() {
      /* clearing the store is not a supported action; keep the rows */
    },
  };

  /** Larger opaque values (the Yjs document) kept beside the rows. */
  const blobGet = async (key: string) => {
    await ready;
    return (await db.select<{ value: string }>("SELECT value FROM blobs WHERE key = ?", [key]))[0]?.value ?? null;
  };
  const blobSet = async (key: string, value: string) => {
    await ready;
    await db.execute("INSERT OR REPLACE INTO blobs (key, value) VALUES (?, ?)", [key, value]);
  };
  return { storage, blobGet, blobSet, flush: () => chain };
}
