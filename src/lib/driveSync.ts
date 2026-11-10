import type { Change } from "../store";
import type { CollectionName } from "../types";

/**
 * Sync between devices through Google Drive's hidden app folder (no server needed).
 *
 * Each device writes ONE file of its own, `ca-sync-<deviceId>.json`, holding every record it knows (events, tasks, notes,
 * contacts, shopping, shared preferences). It only ever reads the other devices' files, and merges them by "newest edit
 * wins" per record, with deletes kept as markers. Drive can't safely handle two devices editing one file at once, so one
 * file per device means there is nothing to conflict. A device downloads a peer's file only when Drive says it changed.
 *
 * This module is the engine: it takes a DriveApi and a LocalState, so it is tested with a fake Drive and fake devices.
 * Nothing in it touches the network or the store directly (see driveSyncApp.ts for that).
 */

export const FILE_PREFIX = "ca-sync-";
export const FORMAT = 1;
export const KEEP_DELETES_DAYS = 180;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const COLLECTIONS: readonly CollectionName[] = ["events", "tasks", "contacts", "notes", "shopping", "prefs", "feedback"];

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export interface DriveApi {
  list(): Promise<DriveFile[]>;
  read(id: string): Promise<unknown>;
  write(name: string, body: string, existingId?: string): Promise<DriveFile>;
}

export interface LocalState {
  deviceId: string;
  deviceName: string;
  platform: string;
  snapshot(): Change[];
  apply(changes: Change[]): void;
  get(collection: CollectionName, id: string): { updatedAt: number } | undefined;
}

export interface SyncFile {
  v: number;
  device: string;
  name: string;
  platform: string;
  writtenAt: number;
  digest: string;
  count: number;
  records: Change[];
}

export interface PeerInfo {
  name: string;
  platform: string;
  modifiedTime: string;
  writtenAt: number;
  digest: string;
  count: number;
}

/** What the app remembers between syncs (kept in settings). */
export interface DriveSyncMeta {
  peers: Record<string, PeerInfo>;
  digest?: string; // digest of the state last written to our own file
}

export interface PeerStatus {
  id: string;
  name: string;
  platform: string;
  writtenAt: number;
  inSync: boolean; // its file matches what this device now has
}

export interface DriveSyncResult {
  applied: number; // records that changed here because of a peer
  uploaded: boolean;
  repaired: number; // peer records that hadn't landed and were re-applied
  peers: PeerStatus[];
  errors: string[]; // per-file problems; the rest of the sync still ran
}

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

/** A fingerprint of a set of records (their ids, edit times and deleted flags), independent of order. */
export function stateDigest(changes: Change[]): string {
  let xor = 0;
  let sum = 0;
  for (const { collection, record } of changes) {
    const h = fnv(`${collection}/${record.id}@${record.updatedAt}:${record.deleted ? 1 : 0}`);
    xor ^= h;
    sum = (sum + h) >>> 0;
  }
  return `${changes.length}-${(xor >>> 0).toString(16)}-${sum.toString(16)}`;
}

/** Drop deletion markers older than `days`: they have had plenty of time to reach every device. */
export const pruneDeletes = (changes: Change[], now: number, days = KEEP_DELETES_DAYS): Change[] =>
  changes.filter((c) => !(c.record.deleted && c.record.updatedAt < now - days * 864e5));

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Read a peer's file defensively: right version, known collections only, well-formed records. Null when unusable. */
export function parseFile(raw: unknown): SyncFile | null {
  if (!isObj(raw) || raw.v !== FORMAT || typeof raw.device !== "string" || !Array.isArray(raw.records)) return null;
  const records = raw.records.filter(
    (c): c is Change =>
      isObj(c) &&
      COLLECTIONS.includes(c.collection as CollectionName) &&
      isObj(c.record) &&
      typeof c.record.id === "string" &&
      Number.isFinite(c.record.updatedAt),
  );
  return {
    v: FORMAT,
    device: raw.device,
    name: typeof raw.name === "string" ? raw.name : raw.device,
    platform: typeof raw.platform === "string" ? raw.platform : "",
    writtenAt: Number.isFinite(raw.writtenAt) ? (raw.writtenAt as number) : 0,
    digest: typeof raw.digest === "string" ? raw.digest : "",
    count: records.length,
    records,
  };
}

const SAFE_ID = /^[A-Za-z0-9_-]{4,64}$/;
export const fileNameFor = (deviceId: string) => `${FILE_PREFIX}${deviceId}.json`;
const peerIdOf = (file: DriveFile) =>
  file.name.startsWith(FILE_PREFIX) && file.name.endsWith(".json") ? file.name.slice(FILE_PREFIX.length, -5) : "";

const isNewer = (local: LocalState, c: Change) => {
  const mine = local.get(c.collection, c.record.id);
  return !mine || mine.updatedAt < c.record.updatedAt;
};

/** One round: pull what peers changed, merge, check nothing was dropped, then write our own file if it changed. */
export async function driveSyncOnce(
  api: DriveApi,
  local: LocalState,
  meta: DriveSyncMeta,
  now = Date.now(),
): Promise<{ meta: DriveSyncMeta; result: DriveSyncResult }> {
  const next: DriveSyncMeta = { digest: meta.digest, peers: { ...meta.peers } };
  const errors: string[] = [];
  let applied = 0;
  let repaired = 0;

  const files = await api.list();
  const mineName = fileNameFor(local.deviceId);
  const mine = files.find((f) => f.name === mineName);

  // 1. pull: only peers whose file changed since we last read it
  const seenNow = new Set<string>();
  for (const f of files) {
    const id = peerIdOf(f);
    if (!id || f.name === mineName) continue;
    if (!SAFE_ID.test(id)) {
      errors.push(`Ignored a sync file with an odd name (${f.name.slice(0, 40)}).`);
      continue;
    }
    seenNow.add(id);
    if (next.peers[id]?.modifiedTime === f.modifiedTime) continue;
    try {
      const file = parseFile(await api.read(f.id));
      if (!file) {
        errors.push(`${id}: not a Calendar Assistant sync file.`);
        continue;
      }
      applied += file.records.filter((c) => isNewer(local, c)).length;
      local.apply(file.records);
      // check: every record the peer holds must now be here, at least as new. If not, apply those again.
      const missing = file.records.filter((c) => isNewer(local, c));
      if (missing.length) {
        local.apply(missing);
        repaired += missing.length;
      }
      next.peers[id] = {
        name: file.name,
        platform: file.platform,
        modifiedTime: f.modifiedTime,
        writtenAt: file.writtenAt,
        digest: file.digest || stateDigest(file.records),
        count: file.count,
      };
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  for (const id of Object.keys(next.peers)) if (!seenNow.has(id)) delete next.peers[id]; // the peer's file is gone

  // 2. push: write our own file when its content changed (or doesn't exist yet)
  const records = pruneDeletes(local.snapshot(), now);
  const digest = stateDigest(records);
  let uploaded = false;
  if (!mine || digest !== meta.digest) {
    const body = JSON.stringify({
      v: FORMAT,
      device: local.deviceId,
      name: local.deviceName,
      platform: local.platform,
      writtenAt: now,
      digest,
      count: records.length,
      records,
    } satisfies SyncFile);
    if (body.length > MAX_FILE_BYTES) throw new Error("Your data is too big to sync through Drive.");
    await api.write(mineName, body, mine?.id);
    next.digest = digest;
    uploaded = true;
  }

  const peers: PeerStatus[] = Object.entries(next.peers).map(([id, p]) => ({
    id,
    name: p.name,
    platform: p.platform,
    writtenAt: p.writtenAt,
    inSync: p.digest === digest,
  }));
  return { meta: next, result: { applied, uploaded, repaired, peers, errors } };
}

/* ---------- freshness ---------- */

export type Freshness = { state: "off" | "fresh" | "stale" | "never"; ageMins: number };

/** Is the calendar this device shows recent enough? `staleMins` is how old a successful sync may get. */
export function freshness(enabled: boolean, lastOkAt: number | undefined, staleMins: number, now = Date.now()): Freshness {
  if (!enabled) return { state: "off", ageMins: 0 };
  if (!lastOkAt) return { state: "never", ageMins: 0 };
  const ageMins = Math.floor((now - lastOkAt) / 60_000);
  return { state: ageMins >= staleMins ? "stale" : "fresh", ageMins };
}

export function ageLabel(ageMins: number): string {
  if (ageMins < 1) return "just now";
  if (ageMins < 60) return `${ageMins} min ago`;
  const h = Math.floor(ageMins / 60);
  return h < 48 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.floor(h / 24)} days ago`;
}
