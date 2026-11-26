import * as Y from "yjs";
import { useStore } from "../../store";
import type { CollectionName, Synced } from "../../types";
import { blobs } from "./storage";

/**
 * Yjs document for the synced collections. One `Y.Map` per collection, one nested `Y.Map` per record, so two devices
 * editing different fields of the same record both win (the per-record last-writer-wins relay keeps only one).
 * Never in the document: mail, bank statements, API keys, tokens, per-device settings.
 */
export const SYNC_COLLECTIONS: readonly CollectionName[] = ["events", "tasks", "contacts", "notes", "shopping", "prefs", "feedback"];
export const LOCAL = "local"; // transaction origin of edits that came from this device's store

type Rec = Synced & Record<string, unknown>;
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Copy a record into the document. Returns true when something changed. `onlyIfNewer`: skip when the document already holds a record at least as new. */
export function writeRecord(doc: Y.Doc, collection: string, rec: Rec, opts: { onlyIfNewer?: boolean } = {}): boolean {
  const coll = doc.getMap<Y.Map<unknown>>(collection);
  let m = coll.get(rec.id);
  if (m && opts.onlyIfNewer && Number(m.get("updatedAt") ?? 0) >= rec.updatedAt) return false;
  let changed = false;
  doc.transact(() => {
    if (!m) {
      m = new Y.Map<unknown>();
      coll.set(rec.id, m);
      changed = true;
    }
    // a record that differs only in `updatedAt` (our own merge bookkeeping) is not an edit
    const keys = Object.keys(rec).filter((k) => rec[k] !== undefined);
    const edited = keys.some((k) => k !== "updatedAt" && !same(m!.get(k), rec[k])) || [...m.keys()].some((k) => !keys.includes(k));
    if (!changed && !edited) return;
    for (const k of keys) if (!same(m.get(k), rec[k])) m.set(k, rec[k]);
    for (const k of [...m.keys()]) if (!keys.includes(k)) m.delete(k);
    changed = true;
  }, LOCAL);
  return changed;
}

export function readRecord(doc: Y.Doc, collection: string, id: string): Rec | undefined {
  const m = doc.getMap<Y.Map<unknown>>(collection).get(id);
  return m ? (m.toJSON() as Rec) : undefined;
}

export const toBase64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromBase64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export const doc = new Y.Doc();
let started = false;

/** Bind the document to the store. Safe to call once; returns a stop function. */
export async function startCrdt(): Promise<() => void> {
  if (started) return () => {};
  started = true;
  try {
    const saved = await blobs.get("ydoc");
    if (saved) Y.applyUpdate(doc, fromBase64(saved), "disk");
  } catch {
    /* damaged copy: start from the store; peers refill the rest */
  }

  const store = () => useStore.getState();
  const pull = (c: CollectionName, id: string) => {
    const rec = readRecord(doc, c, id);
    if (!rec || typeof rec.updatedAt !== "number") return;
    const cur = (store()[c] as Record<string, Synced>)[id];
    if (cur && cur.updatedAt > rec.updatedAt) rec.updatedAt = cur.updatedAt; // keep the newer stamp so the store accepts the merged record
    if (cur && same(cur, rec)) return;
    store().applyRemote([{ collection: c, record: rec as unknown as Synced }]);
    lastRemoteAt = Date.now();
    listeners.forEach((l) => l());
  };

  // document -> store (changes from other devices, and the saved copy at start-up)
  const unobserve = SYNC_COLLECTIONS.map((c) => {
    const map = doc.getMap<Y.Map<unknown>>(c);
    const fn = (events: Y.YEvent<Y.Map<unknown>>[], tr: Y.Transaction) => {
      if (tr.origin === LOCAL) return;
      const ids = new Set<string>();
      for (const ev of events) {
        if (ev.path.length === 0) (ev as Y.YMapEvent<unknown>).keysChanged.forEach((k) => ids.add(k));
        else ids.add(String(ev.path[0]));
      }
      ids.forEach((id) => pull(c, id));
    };
    map.observeDeep(fn as never);
    return () => map.unobserveDeep(fn as never);
  });
  for (const c of SYNC_COLLECTIONS) for (const id of doc.getMap(c).keys()) pull(c, id);

  // store -> document (every local edit, and records that arrived by another route)
  const seen: Partial<Record<CollectionName, object>> = {};
  const push = (seed = false) => {
    const s = store();
    for (const c of SYNC_COLLECTIONS) {
      const coll = s[c] as unknown as Record<string, Rec>;
      if (coll === seen[c]) continue;
      const prev = (seen[c] ?? {}) as Record<string, Rec>;
      for (const id in coll) if (coll[id] !== prev[id]) writeRecord(doc, c, coll[id], { onlyIfNewer: seed });
      seen[c] = coll;
    }
  };
  push(true);
  const unsub = useStore.subscribe(() => push());

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin === "disk") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void blobs.set("ydoc", toBase64(Y.encodeStateAsUpdate(doc))).catch(() => {}), 800);
  };
  doc.on("update", onUpdate);
  return () => {
    clearTimeout(saveTimer);
    unsub();
    unobserve.forEach((u) => u());
    doc.off("update", onUpdate);
    started = false;
  };
}

let lastRemoteAt = 0;
const listeners = new Set<() => void>();
export const lastRemoteChange = () => lastRemoteAt;
export const onRemoteChange = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
