import { describe, expect, it } from "vitest";
import type { Change } from "../store";
import type { CollectionName } from "../types";
import {
  ageLabel,
  driveSyncOnce,
  fileNameFor,
  freshness,
  parseFile,
  pruneDeletes,
  stateDigest,
  type DriveApi,
  type DriveFile,
  type DriveSyncMeta,
  type LocalState,
} from "./driveSync";

/** A fake Drive app folder. */
function fakeDrive() {
  const files = new Map<string, { file: DriveFile; body: string }>();
  let n = 0;
  const calls = { list: 0, read: 0, write: 0 };
  const api: DriveApi = {
    async list() {
      calls.list++;
      return [...files.values()].map((f) => f.file);
    },
    async read(id) {
      calls.read++;
      return JSON.parse([...files.values()].find((f) => f.file.id === id)!.body);
    },
    async write(name, body, existingId) {
      calls.write++;
      const id = existingId ?? `f${++n}`;
      const file = { id, name, modifiedTime: new Date(1_000_000 + ++n * 1000).toISOString() };
      files.set(id, { file, body });
      return file;
    },
  };
  return { api, files, calls };
}

/** A fake device: its own records and the same "newest edit wins" merge the app uses. */
function device(
  id: string,
  opts: { dropOnce?: string } = {},
): LocalState & {
  db: Map<string, Change>;
  put(c: CollectionName, rid: string, updatedAt: number, extra?: object): void;
  meta: DriveSyncMeta;
} {
  const db = new Map<string, Change>();
  let dropped = false;
  const key = (c: string, rid: string) => `${c}/${rid}`;
  return {
    deviceId: id,
    deviceName: `Device ${id}`,
    platform: id.startsWith("win") ? "windows" : "android",
    db,
    meta: { peers: {} },
    snapshot: () => [...db.values()],
    apply(changes) {
      for (const c of changes) {
        if (opts.dropOnce === c.record.id && !dropped) {
          dropped = true; // simulate a record that doesn't land the first time
          continue;
        }
        const cur = db.get(key(c.collection, c.record.id));
        if (!cur || cur.record.updatedAt <= c.record.updatedAt) db.set(key(c.collection, c.record.id), c);
      }
    },
    get: (c, rid) => db.get(key(c, rid))?.record,
    put(c, rid, updatedAt, extra = {}) {
      db.set(key(c, rid), { collection: c, record: { id: rid, updatedAt, ...extra } as Change["record"] });
    },
  };
}

async function sync(drive: ReturnType<typeof fakeDrive>, d: ReturnType<typeof device>, now = 5_000_000) {
  const r = await driveSyncOnce(drive.api, d, d.meta, now);
  d.meta = r.meta;
  return r.result;
}

describe("syncing two devices through Drive", () => {
  it("merges what each has, in a few rounds", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    const and = device("and-2222");
    win.put("events", "e1", 10, { title: "Dentist" });
    and.put("tasks", "t1", 20, { title: "Buy milk" });
    await sync(drive, win);
    await sync(drive, and);
    await sync(drive, win);
    expect([...win.db.keys()].sort()).toEqual(["events/e1", "tasks/t1"]);
    expect([...and.db.keys()].sort()).toEqual(["events/e1", "tasks/t1"]);
  });
  it("newest edit wins, on both devices", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    const and = device("and-2222");
    win.put("events", "e1", 10, { title: "Old" });
    await sync(drive, win);
    await sync(drive, and);
    and.put("events", "e1", 30, { title: "Moved by phone" });
    win.put("events", "e1", 20, { title: "Edited on PC" });
    await sync(drive, and);
    await sync(drive, win);
    await sync(drive, and);
    expect((win.get("events", "e1") as any).title).toBe("Moved by phone");
    expect((and.get("events", "e1") as any).title).toBe("Moved by phone");
  });
  it("a deletion reaches the other device and doesn't come back", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    const and = device("and-2222");
    win.put("events", "e1", 10, { title: "X" });
    await sync(drive, win);
    await sync(drive, and);
    and.put("events", "e1", 50, { title: "X", deleted: true });
    await sync(drive, and);
    await sync(drive, win);
    await sync(drive, and);
    expect((win.get("events", "e1") as any).deleted).toBe(true);
    expect((and.get("events", "e1") as any).deleted).toBe(true);
  });
  it("downloads a peer's file only when it changed, and writes only when our data changed", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    const and = device("and-2222");
    win.put("events", "e1", 10);
    await sync(drive, win);
    await sync(drive, and);
    const before = { ...drive.calls };
    const again = await sync(drive, and);
    expect(again.uploaded).toBe(false);
    expect(drive.calls.read).toBe(before.read); // nothing new from the peer: no download
    expect(drive.calls.write).toBe(before.write); // nothing new here: no upload
  });
  it("reports whether a peer matches what this device now has", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    const and = device("and-2222");
    win.put("events", "e1", 10);
    await sync(drive, win);
    await sync(drive, and);
    expect((await sync(drive, win)).peers[0]).toMatchObject({ id: "and-2222", inSync: true });
    win.put("events", "e2", 30); // a new edit the phone hasn't seen
    expect((await sync(drive, win)).peers[0].inSync).toBe(false);
    await sync(drive, and);
    expect((await sync(drive, win)).peers[0].inSync).toBe(true);
  });
  it("re-applies a peer record that didn't land, and says so", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    const and = device("and-2222", { dropOnce: "e1" });
    win.put("events", "e1", 10);
    win.put("events", "e2", 11);
    await sync(drive, win);
    const r = await sync(drive, and);
    expect(r.repaired).toBe(1);
    expect(and.get("events", "e1")).toBeDefined();
  });
  it("skips a bad file but still syncs the others", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    win.put("events", "e1", 10);
    await sync(drive, win);
    drive.files.set("x", {
      file: { id: "x", name: "ca-sync-evil-9999.json", modifiedTime: "2026-01-01T00:00:00Z" },
      body: JSON.stringify({
        v: 1,
        device: "evil-9999",
        records: [
          { collection: "settings", record: { id: "a", updatedAt: 1 } },
          { collection: "events", record: { id: 5 } },
        ],
      }),
    });
    drive.files.set("y", {
      file: { id: "y", name: "ca-sync-junk-0000.json", modifiedTime: "2026-01-01T00:00:00Z" },
      body: JSON.stringify({ hello: "world" }),
    });
    const and = device("and-2222");
    const r = await sync(drive, and);
    expect(r.errors.join()).toContain("junk-0000");
    expect(and.get("events", "e1")).toBeDefined();
    expect([...and.db.keys()].some((k) => k.startsWith("settings"))).toBe(false); // an unknown collection is never written
  });
  it("ignores files with odd names and its own file", async () => {
    const drive = fakeDrive();
    drive.files.set("z", { file: { id: "z", name: "ca-sync-../../x.json", modifiedTime: "2026-01-01T00:00:00Z" }, body: "{}" });
    const win = device("win-1111");
    win.put("events", "e1", 10);
    await sync(drive, win);
    const r = await sync(drive, win);
    expect(r.errors.join()).toContain("odd name");
    expect(drive.calls.read).toBe(0);
  });
  it("forgets a peer whose file was deleted", async () => {
    const drive = fakeDrive();
    const win = device("win-1111");
    const and = device("and-2222");
    win.put("events", "e1", 10);
    await sync(drive, win);
    await sync(drive, and);
    drive.files.delete([...drive.files.values()].find((f) => f.file.name === fileNameFor("win-1111"))!.file.id);
    const r = await sync(drive, and);
    expect(r.peers).toEqual([]);
  });
});

describe("file contents", () => {
  const c = (id: string, updatedAt: number, deleted = false): Change => ({
    collection: "events",
    record: { id, updatedAt, deleted } as Change["record"],
  });
  it("the digest ignores order and notices any change", () => {
    expect(stateDigest([c("a", 1), c("b", 2)])).toBe(stateDigest([c("b", 2), c("a", 1)]));
    expect(stateDigest([c("a", 1)])).not.toBe(stateDigest([c("a", 2)]));
    expect(stateDigest([c("a", 1)])).not.toBe(stateDigest([c("a", 1, true)]));
  });
  it("drops deletion markers older than the keep period, never live records", () => {
    const now = 1e12;
    const old = now - 200 * 864e5;
    expect(pruneDeletes([c("a", old, true), c("b", old), c("d", now - 864e5, true)], now).map((x) => x.record.id)).toEqual(["b", "d"]);
  });
  it("rejects a file of the wrong version or shape", () => {
    expect(parseFile({ v: 2, device: "x", records: [] })).toBeNull();
    expect(parseFile(null)).toBeNull();
    expect(
      parseFile({
        v: 1,
        device: "x",
        records: [
          { collection: "events", record: { id: "a", updatedAt: 1 } },
          { collection: "nope", record: { id: "b", updatedAt: 1 } },
        ],
      })?.records,
    ).toHaveLength(1);
  });
});

describe("freshness", () => {
  const now = 10_000_000;
  it("is off when off, never when never synced, stale past the limit", () => {
    expect(freshness(false, undefined, 30, now).state).toBe("off");
    expect(freshness(true, undefined, 30, now).state).toBe("never");
    expect(freshness(true, now - 10 * 60_000, 30, now)).toEqual({ state: "fresh", ageMins: 10 });
    expect(freshness(true, now - 45 * 60_000, 30, now).state).toBe("stale");
  });
  it("words the age plainly", () => {
    expect(ageLabel(0)).toBe("just now");
    expect(ageLabel(5)).toBe("5 min ago");
    expect(ageLabel(120)).toBe("2 hours ago");
    expect(ageLabel(60 * 72)).toBe("3 days ago");
  });
});
