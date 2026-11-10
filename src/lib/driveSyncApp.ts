import { create } from "zustand";
import { onLocalChange, useStore, type Change } from "../store";
import type { CollectionName } from "../types";
import { driveSyncOnce, FILE_PREFIX, type DriveApi, type DriveSyncResult, type LocalState, type PeerStatus } from "./driveSync";
import { appFolderId, gfetch, googleConnected, googleToken, quietly, SCOPES } from "./google";
import { syncDue } from "./googleMap";
import { platformName } from "./platform";
import { allLocalChanges } from "./sync";

/** Drive sync wired to the real app: Google Drive, the store, and when to run. The engine is in driveSync.ts. */

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FIELDS = "id,name,modifiedTime";

export const googleDriveApi = (): DriveApi => ({
  async list() {
    const parent = await appFolderId();
    const q = encodeURIComponent(`name contains '${FILE_PREFIX}' and '${parent}' in parents and trashed=false`);
    const j = await gfetch(`${DRIVE}?q=${q}&fields=files(${FIELDS})&pageSize=100`, SCOPES.drive);
    return j?.files ?? [];
  },
  read: (id) => gfetch(`${DRIVE}/${id}?alt=media`, SCOPES.drive),
  async write(name, body, existingId) {
    const boundary = "ca" + Math.random().toString(36).slice(2);
    const meta = existingId ? {} : { name, parents: [await appFolderId()] };
    const payload = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    return gfetch(`${existingId ? `${UPLOAD}/${existingId}` : UPLOAD}?uploadType=multipart&fields=${FIELDS}`, SCOPES.drive, {
      method: existingId ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: payload,
    });
  },
});

/** This device's records, as the engine sees them. `apply` is the same newest-edit-wins merge the sync server uses. */
export function storeAdapter(): LocalState {
  const st = useStore.getState();
  return {
    deviceId: st.deviceId,
    deviceName: st.settings.sync.deviceName || st.settings.displayName || platformName(),
    platform: platformName(),
    snapshot: () => allLocalChanges(),
    apply: (changes: Change[]) => useStore.getState().applyRemote(changes),
    get: (collection: CollectionName, id: string) => (useStore.getState()[collection] as Record<string, { updatedAt: number }>)[id],
  };
}

export const useDriveSync = create<{ syncing: boolean; peers: PeerStatus[]; repaired: number; errors: string[] }>(() => ({
  syncing: false,
  peers: [],
  repaired: 0,
  errors: [],
}));

/** Drive sync works on Windows (loopback sign-in) and on Android (device-code sign-in). */
export const driveSyncAvailable = () => true;

const friendly = (e: unknown) => {
  const m = (e as Error).message ?? String(e);
  return /sign in|Google 401|Google 403/i.test(m) ? "Google needs you to sign in again." : m.slice(0, 160);
};

let inflight: Promise<DriveSyncResult | null> | null = null;

/** One round now: pull what other devices changed, merge, and write this device's file if it changed. */
export function driveSyncNow(): Promise<DriveSyncResult | null> {
  inflight ??= (async () => {
    useDriveSync.setState({ syncing: true });
    try {
      const { meta, result } = await driveSyncOnce(googleDriveApi(), storeAdapter(), useStore.getState().settings.driveSync.meta);
      useStore.getState().updateSettings((s) => {
        s.driveSync.meta = meta;
        s.driveSync.lastOkAt = Date.now();
        s.driveSync.lastError = undefined;
      });
      useDriveSync.setState({ peers: result.peers, repaired: result.repaired, errors: result.errors });
      return result;
    } catch (e) {
      const msg = friendly(e);
      useStore.getState().updateSettings((s) => void (s.driveSync.lastError = msg));
      throw new Error(msg);
    } finally {
      useDriveSync.setState({ syncing: false });
    }
  })().finally(() => (inflight = null));
  return inflight;
}

/** Switch Drive sync on and sync (the sign-in is already done). */
export async function enableDriveSync(): Promise<DriveSyncResult | null> {
  useStore.getState().updateSettings((s) => void (s.driveSync.enabled = true));
  return driveSyncNow();
}

/** Windows: sign in to Drive if needed, switch Drive sync on, and sync. (Android signs in with a code first.) */
export async function connectDriveSync(): Promise<DriveSyncResult | null> {
  await googleToken([SCOPES.drive]);
  return enableDriveSync();
}

/**
 * Background sync: when the app opens, when its window returns, every `everyMins`, and about 20 seconds after you
 * change something here. Silent (no sign-in window); a failure shows in Settings and in the "may be out of date" banner.
 */
export function startDriveSync(): () => void {
  let lastTry = 0;
  const ready = () => {
    const d = useStore.getState().settings.driveSync;
    return d.enabled && googleConnected(SCOPES.drive) ? d : null;
  };
  const run = (onOpen = false) => {
    const d = ready();
    if (!d || !syncDue(onOpen ? 1 : d.everyMins, Math.max(lastTry, d.lastOkAt ?? 0))) return;
    lastTry = Date.now();
    quietly(driveSyncNow).catch(() => {});
  };
  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  const offChange = onLocalChange(() => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => ready() && quietly(driveSyncNow).catch(() => {}), 20_000);
  });
  run(true);
  const timer = setInterval(() => run(), 30_000);
  const onFocus = () => run(true);
  const onVisible = () => document.visibilityState === "visible" && run(true);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    clearTimeout(pushTimer);
    offChange();
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
