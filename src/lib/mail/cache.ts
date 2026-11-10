import type { MailMessage } from "./types";

/**
 * Mail cache: IndexedDB on this device only. Not a store collection, never synced, never in backups.
 * Message text is kept only when `cacheText` is on; older mail is evicted first when over the size cap.
 */

const DB = "calendar-assistant-mail";
const STORE = "messages";

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("accountId", "accountId");
      s.createIndex("receivedAt", "receivedAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
/** For tests: forget the open connection. */
export function resetCacheConnection() {
  dbp?.then((d) => d.close()).catch(() => {});
  dbp = null;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => ((tx.oncomplete = () => res()), (tx.onerror = () => rej(tx.error)), (tx.onabort = () => rej(tx.error))));
const result = <T>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));

export async function putMessages(msgs: MailMessage[], keepText: boolean): Promise<void> {
  if (!msgs.length) return;
  const d = await db();
  const tx = d.transaction(STORE, "readwrite");
  const s = tx.objectStore(STORE);
  for (const m of msgs) s.put(keepText ? m : { ...m, text: undefined });
  await done(tx);
}

export async function deleteMessages(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const d = await db();
  const tx = d.transaction(STORE, "readwrite");
  for (const id of ids) tx.objectStore(STORE).delete(id);
  await done(tx);
}

export async function getMessage(id: string): Promise<MailMessage | undefined> {
  return result((await db()).transaction(STORE).objectStore(STORE).get(id));
}

export async function getMessages(ids: string[]): Promise<Map<string, MailMessage>> {
  const d = await db();
  const s = d.transaction(STORE).objectStore(STORE);
  const found = await Promise.all(ids.map((id) => result(s.get(id))));
  return new Map(found.filter(Boolean).map((m) => [m.id, m as MailMessage]));
}

/** Newest first. */
export async function allMessages(): Promise<MailMessage[]> {
  const all: MailMessage[] = await result((await db()).transaction(STORE).objectStore(STORE).getAll());
  return all.sort((a, b) => b.receivedAt - a.receivedAt);
}

export async function clearAccount(accountId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(STORE, "readwrite");
  const idx = tx.objectStore(STORE).index("accountId");
  const keys: IDBValidKey[] = await result(idx.getAllKeys(accountId));
  for (const k of keys) tx.objectStore(STORE).delete(k);
  await done(tx);
}

/** Rough size in bytes (JSON length). */
export async function approxSize(): Promise<number> {
  return (await allMessages()).reduce((n, m) => n + JSON.stringify(m).length, 0);
}

/** Drop the oldest messages until under `maxBytes`. Returns how many were removed. */
export async function evictOver(maxBytes: number): Promise<number> {
  const all = await allMessages(); // newest first
  let size = all.reduce((n, m) => n + JSON.stringify(m).length, 0);
  const drop: string[] = [];
  for (let i = all.length - 1; i >= 0 && size > maxBytes; i--) {
    size -= JSON.stringify(all[i]).length;
    drop.push(all[i].id);
  }
  await deleteMessages(drop);
  return drop.length;
}
