import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { readRecord, writeRecord } from "./crdtEngine";
import { useStore } from "../../store";

const task = { id: "t1", title: "Buy milk", done: false, due: "2026-11-27", updatedAt: 1 };
const link = (a: Y.Doc, b: Y.Doc) => {
  a.on("update", (u: Uint8Array, o: unknown) => o !== "peer" && Y.applyUpdate(b, u, "peer"));
  b.on("update", (u: Uint8Array, o: unknown) => o !== "peer" && Y.applyUpdate(a, u, "peer"));
};
const offline = () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  writeRecord(a, "tasks", task);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return { a, b };
};
const exchange = (a: Y.Doc, b: Y.Doc) => {
  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, ua);
  Y.applyUpdate(a, ub);
};

describe("per-record last-writer-wins (the existing relay), documented defect", () => {
  beforeEach(() => useStore.setState({ tasks: { t1: { ...task, updatedAt: 2, done: true } as never } }));
  it("loses the Android edit when Windows saves a newer copy of the same record", () => {
    // Windows changed only the due date at t=3 but its copy still says done:false
    useStore.getState().applyRemote([{ collection: "tasks", record: { ...task, updatedAt: 3, due: "2026-11-30" } as never }]);
    expect(useStore.getState().tasks.t1.done).toBe(false); // the completion is gone
  });
});

describe("Yjs field-level merge", () => {
  it("keeps 'done' from Android and the new due date from Windows", () => {
    const { a, b } = offline();
    writeRecord(a, "tasks", { ...task, updatedAt: 2, done: true }); // Android completes it
    writeRecord(b, "tasks", { ...task, updatedAt: 3, due: "2026-11-30" }); // Windows reschedules it, same moment
    exchange(a, b);
    for (const d of [a, b]) expect(readRecord(d, "tasks", "t1")).toMatchObject({ done: true, due: "2026-11-30" });
    expect(readRecord(a, "tasks", "t1")).toEqual(readRecord(b, "tasks", "t1")); // both devices converge
  });

  it("is order independent and idempotent", () => {
    const { a, b } = offline();
    writeRecord(a, "tasks", { ...task, updatedAt: 2, title: "Buy oat milk" });
    writeRecord(b, "tasks", { ...task, updatedAt: 3, deleted: true });
    exchange(a, b);
    exchange(a, b);
    expect(readRecord(a, "tasks", "t1")).toEqual(readRecord(b, "tasks", "t1"));
    expect(readRecord(a, "tasks", "t1")).toMatchObject({ title: "Buy oat milk", deleted: true });
  });

  it("streams live edits both ways", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    link(a, b);
    writeRecord(a, "tasks", task);
    writeRecord(b, "tasks", { ...task, updatedAt: 2, done: true });
    expect(readRecord(a, "tasks", "t1")?.done).toBe(true);
  });

  it("does not write when only updatedAt differs, and drops removed fields", () => {
    const d = new Y.Doc();
    writeRecord(d, "tasks", { ...task, notes: "x" });
    expect(writeRecord(d, "tasks", { ...task, notes: "x", updatedAt: 9 })).toBe(false);
    expect(writeRecord(d, "tasks", { ...task })).toBe(true);
    expect(readRecord(d, "tasks", "t1")).not.toHaveProperty("notes");
  });

  it("seeding never overwrites a newer record", () => {
    const d = new Y.Doc();
    writeRecord(d, "tasks", { ...task, updatedAt: 5, done: true });
    expect(writeRecord(d, "tasks", { ...task, updatedAt: 2 }, { onlyIfNewer: true })).toBe(false);
    expect(readRecord(d, "tasks", "t1")?.done).toBe(true);
  });
});
