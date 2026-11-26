import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { sqliteStorage, type SqlDb } from "./sqliteStorage";

function memoryDb() {
  const raw = new DatabaseSync(":memory:");
  const log: string[] = [];
  const db: SqlDb = {
    async execute(sql, p = []) {
      log.push(sql);
      raw.prepare(sql).run(...(p as never[]));
    },
    async select<T>(sql: string, p: unknown[] = []) {
      return raw.prepare(sql).all(...(p as never[])) as T[];
    },
  };
  return { db, raw, log };
}
const state = (tasks: object, extra: object = {}) =>
  JSON.stringify({ state: { deviceId: "d1", settings: { theme: "ink" }, tasks, lastSyncSeq: 3, ...extra }, version: 1 });

describe("SQLite store", () => {
  it("round-trips records and settings through real tables", async () => {
    const { db, raw } = memoryDb();
    const a = sqliteStorage(db);
    await a.storage.getItem("x");
    await a.storage.setItem("x", state({ t1: { id: "t1", title: "A", updatedAt: 5 } }));
    expect((raw.prepare("SELECT updated_at FROM tasks WHERE id='t1'").get() as { updated_at: number }).updated_at).toBe(5);
    const b = sqliteStorage(db); // a fresh start on the same file
    const got = JSON.parse((await b.storage.getItem("x")) as string);
    expect(got.state.tasks.t1.title).toBe("A");
    expect(got.state.settings).toEqual({ theme: "ink" });
    expect(got.state.lastSyncSeq).toBe(3);
  });

  it("writes only rows that changed, and mirrors tombstones", async () => {
    const { db, log } = memoryDb();
    const s = sqliteStorage(db);
    await s.storage.getItem("x");
    const t = { t1: { id: "t1", updatedAt: 1 }, t2: { id: "t2", updatedAt: 1 } };
    await s.storage.setItem("x", state(t));
    log.length = 0;
    await s.storage.setItem("x", state({ ...t, t2: { id: "t2", updatedAt: 2, deleted: true } }));
    expect(log.filter((q) => q.startsWith("INSERT OR REPLACE INTO tasks"))).toHaveLength(1);
    expect(log.filter((q) => q.includes("INTO kv"))).toHaveLength(0);
  });

  it("migrates the old single-blob save on first run and never writes before the first read", async () => {
    const { db, raw } = memoryDb();
    const old = state({ t9: { id: "t9", title: "Old", updatedAt: 1 } });
    const s = sqliteStorage(db, () => old);
    await s.storage.setItem("x", state({})); // too early: ignored, must not wipe anything
    expect(await s.storage.getItem("x")).toBe(old); // still the old save: the early write stored nothing
    expect(raw.prepare("SELECT count(*) AS n FROM kv").get()).toEqual({ n: 0 });
    await s.storage.setItem("x", old);
    expect((raw.prepare("SELECT id FROM tasks").get() as { id: string }).id).toBe("t9");
  });

  it("stores the Yjs document next to the rows", async () => {
    const { db } = memoryDb();
    const s = sqliteStorage(db);
    await s.blobSet("ydoc", "AAEC");
    expect(await s.blobGet("ydoc")).toBe("AAEC");
    expect(await s.blobGet("none")).toBeNull();
  });
});
