import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutgoingMail } from "./compose";
import { discardOutbox, processOutbox, queueSend, refreshOutbox, retrySend, undoSend, useOutbox } from "./outbox";

const draft = (id: string): OutgoingMail => ({
  id,
  accountId: "a",
  mode: "new",
  to: [{ address: "x@y.com" }],
  cc: [],
  bcc: [],
  subject: "s",
  body: "b",
  attachments: [],
});

beforeEach(async () => {
  for (const i of await refreshOutbox()) await discardOutbox(i.id);
});

describe("outbox", () => {
  it("holds a message for the undo time, then sends it", async () => {
    await queueSend(draft("m1"), 10_000, undefined, 1000);
    const send = vi.fn().mockResolvedValue(undefined);
    expect((await processOutbox(send, 5000)).sent).toHaveLength(0); // still inside the undo window
    expect(send).not.toHaveBeenCalled();
    const r = await processOutbox(send, 11_001);
    expect(r.sent.map((i) => i.id)).toEqual(["m1"]);
    expect(useOutbox.getState().items).toHaveLength(0);
  });
  it("undo brings the draft back and nothing is sent", async () => {
    await queueSend(draft("m2"), 10_000, undefined, 1000);
    const back = await undoSend("m2");
    expect(back?.id).toBe("m2");
    const send = vi.fn();
    await processOutbox(send, 99_999);
    expect(send).not.toHaveBeenCalled();
    expect(await undoSend("m2")).toBeNull();
  });
  it("send later waits for its time", async () => {
    await queueSend(draft("m3"), 3 * 3600e3, undefined, 0);
    const send = vi.fn().mockResolvedValue(undefined);
    await processOutbox(send, 3600e3);
    expect(send).not.toHaveBeenCalled();
    await processOutbox(send, 3 * 3600e3 + 1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("a failure keeps the message, marks it failed with the reason, and can be retried", async () => {
    await queueSend(draft("m4"), 0, undefined, 0);
    const r = await processOutbox(async () => {
      throw new Error("LOGIN failed");
    }, 1);
    expect(r.failed[0].error).toContain("LOGIN failed");
    expect(useOutbox.getState().items[0].status).toBe("failed");
    const ok = vi.fn().mockResolvedValue(undefined);
    await processOutbox(ok, 2); // a failed one isn't retried by itself
    expect(ok).not.toHaveBeenCalled();
    await retrySend("m4", 3);
    await processOutbox(ok, 4);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
