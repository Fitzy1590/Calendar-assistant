import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { doc, readRecord, startCrdt, writeRecord } from "./crdtEngine";
import { useStore } from "../../store";

let stop = () => {};
beforeAll(async () => {
  useStore.setState({ tasks: {} });
  stop = await startCrdt();
});
afterAll(() => stop());

describe("store <-> Yjs binding", () => {
  it("copies a local edit into the document", () => {
    const t = useStore.getState().upsert("tasks", { title: "Pay rates", done: false } as never);
    expect(readRecord(doc, "tasks", t.id)).toMatchObject({ title: "Pay rates", done: false });
  });

  it("applies a merged edit from another device to the store without echoing it back", () => {
    const t = useStore.getState().upsert("tasks", { title: "Book dentist", done: false, due: "2026-12-01" } as never);
    // another device, starting from the same state, completes the task
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    writeRecord(peer, "tasks", { ...readRecord(peer, "tasks", t.id)!, done: true, updatedAt: t.updatedAt + 5 });
    // meanwhile this device changes the due date
    useStore.getState().upsert("tasks", { id: t.id, due: "2026-12-08" } as never);
    const before = Y.encodeStateVector(doc);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, before), "peer");
    expect(useStore.getState().tasks[t.id]).toMatchObject({ done: true, due: "2026-12-08" });
    expect(readRecord(doc, "tasks", t.id)).toMatchObject({ done: true, due: "2026-12-08" });
  });

  it("picks up a record that arrived by another route", () => {
    useStore
      .getState()
      .applyRemote([{ collection: "tasks", record: { id: "x1", title: "From Drive", done: false, updatedAt: 10 } as never }]);
    expect(readRecord(doc, "tasks", "x1")?.title).toBe("From Drive");
  });
});
