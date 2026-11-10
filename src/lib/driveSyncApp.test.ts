import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../store";
import { driveSyncOnce, fileNameFor, type DriveApi, type DriveSyncMeta } from "./driveSync";
import { storeAdapter } from "./driveSyncApp";

function fakeDrive(initial: Record<string, unknown> = {}) {
  const files = new Map<string, { name: string; body: string; modifiedTime: string }>();
  let n = 0;
  for (const [name, content] of Object.entries(initial))
    files.set(`id${++n}`, { name, body: JSON.stringify(content), modifiedTime: "2026-11-10T00:00:00Z" });
  const api: DriveApi = {
    list: async () => [...files].map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime })),
    read: async (id) => JSON.parse(files.get(id)!.body),
    write: async (name, body, id) => {
      const key = id ?? `id${++n}`;
      files.set(key, { name, body, modifiedTime: new Date().toISOString() });
      return { id: key, name, modifiedTime: files.get(key)!.modifiedTime };
    },
  };
  return { api, files };
}

beforeEach(() => {
  useStore.setState({ events: {}, tasks: {}, notes: {}, contacts: {}, shopping: {}, prefs: {} });
});

describe("Drive sync against the real store", () => {
  it("brings a peer's event into this device and writes this device's records back, never keys", async () => {
    useStore.getState().updateSettings((s) => void (s.assistant.apiKey = "sk-ant-SECRET"));
    const mine = useStore.getState().upsert("tasks", { title: "Buy milk", done: false, priority: "med" });
    const peer = {
      v: 1,
      device: "android-9999",
      name: "Pixel",
      platform: "android",
      writtenAt: 1,
      digest: "",
      count: 1,
      records: [
        {
          collection: "events",
          record: { id: "ev1", updatedAt: Date.now(), title: "Dentist", start: "2026-11-12T10:00", end: "2026-11-12T11:00", allDay: false },
        },
      ],
    };
    const drive = fakeDrive({ "ca-sync-android-9999.json": peer });
    const meta: DriveSyncMeta = { peers: {} };
    const { result } = await driveSyncOnce(drive.api, storeAdapter(), meta);
    expect(result.applied).toBe(1);
    expect((useStore.getState().events as any).ev1.title).toBe("Dentist");
    const written = [...drive.files.values()].find((f) => f.name === fileNameFor(useStore.getState().deviceId))!;
    expect(written.body).toContain(mine.id);
    expect(written.body).toContain("ev1"); // the merged state goes out too
    expect(written.body).not.toContain("SECRET");
    expect(Object.keys(JSON.parse(written.body))).not.toContain("settings");
  });
  it("a newer local edit is not overwritten by an older peer copy", async () => {
    const ev = useStore
      .getState()
      .upsert("events", { title: "Edited here", start: "2026-11-12T10:00", end: "2026-11-12T11:00", allDay: false });
    const peer = {
      v: 1,
      device: "win-8888",
      records: [{ collection: "events", record: { ...ev, title: "Old copy", updatedAt: ev.updatedAt - 1000 } }],
    };
    const drive = fakeDrive({ "ca-sync-win-8888.json": peer });
    await driveSyncOnce(drive.api, storeAdapter(), { peers: {} });
    expect((useStore.getState().events as any)[ev.id].title).toBe("Edited here");
  });
});
