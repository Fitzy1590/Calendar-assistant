import { create } from "zustand";
import type { OutgoingMail } from "./compose";

/**
 * Mail waiting to go out. Send puts a message here for a few seconds so it can be undone; "Send later" puts it here until a time.
 * It is kept on this device (IndexedDB), so it survives closing the app, and goes out the next time the app is open after its time.
 */

export interface OutboxItem {
  id: string;
  draft: OutgoingMail;
  sendAt: number;
  status: "queued" | "sending" | "failed";
  error?: string;
  followUpDays?: number;
}

const DB = "calendar-assistant-outbox";
const STORE = "items";
let dbp: Promise<IDBDatabase> | null = null;

export const resetOutboxConnection = () => void (dbp = null);

const open = () =>
  (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => void r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));

const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const useOutbox = create<{ items: OutboxItem[] }>(() => ({ items: [] }));

export async function refreshOutbox() {
  const items = (await run<OutboxItem[]>("readonly", (s) => s.getAll())).sort((a, b) => a.sendAt - b.sendAt);
  useOutbox.setState({ items });
  return items;
}

export async function queueSend(draft: OutgoingMail, delayMs: number, followUpDays?: number, now = Date.now()): Promise<OutboxItem> {
  const item: OutboxItem = { id: draft.id, draft, sendAt: now + delayMs, status: "queued", followUpDays };
  await run("readwrite", (s) => s.put(item));
  await refreshOutbox();
  return item;
}

/** Take it back before it goes. Only works while it is still waiting. Returns the draft so it can be reopened. */
export async function undoSend(id: string): Promise<OutgoingMail | null> {
  const item = await run<OutboxItem | undefined>("readonly", (s) => s.get(id));
  if (!item || item.status !== "queued") return null;
  await run("readwrite", (s) => s.delete(id));
  await refreshOutbox();
  return item.draft;
}

export async function discardOutbox(id: string) {
  await run("readwrite", (s) => s.delete(id));
  await refreshOutbox();
}

export async function retrySend(id: string, now = Date.now()) {
  const item = await run<OutboxItem | undefined>("readonly", (s) => s.get(id));
  if (!item) return;
  await run("readwrite", (s) => s.put({ ...item, status: "queued", error: undefined, sendAt: now }));
  await refreshOutbox();
}

let processing = false;

/** Send everything that is due. A failure keeps the message (marked failed) so nothing you wrote is lost. */
export async function processOutbox(
  send: (item: OutboxItem) => Promise<void>,
  now = Date.now(),
): Promise<{ sent: OutboxItem[]; failed: OutboxItem[] }> {
  const out = { sent: [] as OutboxItem[], failed: [] as OutboxItem[] };
  if (processing) return out;
  processing = true;
  try {
    const due = (await run<OutboxItem[]>("readonly", (s) => s.getAll())).filter((i) => i.status === "queued" && i.sendAt <= now);
    for (const item of due) {
      await run("readwrite", (s) => s.put({ ...item, status: "sending" }));
      try {
        await send(item);
        await run("readwrite", (s) => s.delete(item.id));
        out.sent.push(item);
      } catch (e) {
        const failed = { ...item, status: "failed" as const, error: String((e as Error)?.message ?? e).slice(0, 300) };
        await run("readwrite", (s) => s.put(failed));
        out.failed.push(failed);
      }
    }
    if (due.length) await refreshOutbox();
  } finally {
    processing = false;
  }
  return out;
}
