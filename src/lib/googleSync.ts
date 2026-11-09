import { addDays } from "date-fns";
import type { CalEvent } from "../types";
import { useStore } from "../store";
import { fromGoogle, instanceInfo, toGoogle } from "./googleMap";
import { fromYmd } from "./util";

export const CAL = "https://www.googleapis.com/calendar/v3/calendars";

/** One authorised Google API call: returns the JSON, or null for 204 / 410. Throws "Google <status>: …" otherwise. */
export type GoogleApi = (url: string, init?: RequestInit) => Promise<any>;

/** True when a Google API error means "that event isn't there (any more)". */
const isGone = (err: unknown) => /Google (404|410)\b/.test((err as Error)?.message ?? "");

/**
 * Everything that changed in Google since the last sync (a "sync token"), or on the first sync / after Google
 * expires the token, every event from 60 days ago onward. Deleted events come back as status "cancelled".
 */
async function fetchChanges(api: GoogleApi, calendarId: string, syncToken?: string): Promise<{ items: any[]; nextSyncToken?: string }> {
  const items: any[] = [];
  let page = "";
  let next: string | undefined;
  for (let i = 0; i < 40; i++) {
    const q = syncToken ? `syncToken=${encodeURIComponent(syncToken)}` : `timeMin=${addDays(new Date(), -60).toISOString()}`;
    const j = await api(
      `${CAL}/${encodeURIComponent(calendarId)}/events?maxResults=250&showDeleted=true&${q}${page ? `&pageToken=${page}` : ""}`,
    );
    if (!j) return syncToken ? fetchChanges(api, calendarId) : { items }; // 410: Google dropped our token, start over
    items.push(...(j.items ?? []));
    page = j.nextPageToken ?? "";
    next = j.nextSyncToken ?? next;
    if (!page) break;
  }
  return { items, nextSyncToken: next };
}

let inflight: Promise<string> | null = null;

/**
 * Two-way sync with Google Calendar (one run at a time).
 *  Pull: only what changed in Google since last time. New events are added, edited ones updated (newest edit wins),
 *        deleted ones removed here. A deleted or moved single occurrence of a repeating event becomes an exception.
 *  Push: new local events are created in Google, edited ones patched, deleted ones removed.
 * A failure on one event doesn't stop the rest; failed ones are retried next time.
 */
export function syncCalendarWith(api: GoogleApi): Promise<string> {
  inflight ??= runSync(api)
    .then((m) => {
      useStore.getState().updateSettings((s) => void (s.google.lastCalendarSyncError = undefined));
      return m;
    })
    .catch((err: Error) => {
      useStore.getState().updateSettings((s) => void (s.google.lastCalendarSyncError = err.message));
      throw err;
    })
    .finally(() => (inflight = null));
  return inflight;
}

async function runSync(api: GoogleApi): Promise<string> {
  const st = useStore.getState();
  const { calendarId, lastCalendarSync = 0, syncToken } = st.settings.google;
  const { items, nextSyncToken } = await fetchChanges(api, calendarId, syncToken);

  // Events this device holds for each Google id. Two copies (both devices pulled it at once): keep one, unlink the other
  // first so deleting it here can't delete the Google event.
  const byGid = new Map<string, CalEvent>();
  for (const e of Object.values(st.events)) {
    if (!e.googleId) continue;
    const have = byGid.get(e.googleId);
    if (!have) byGid.set(e.googleId, e);
    else {
      const [keep, dup] = have.deleted && !e.deleted ? [e, have] : [have, e];
      byGid.set(e.googleId, keep);
      if (!dup.deleted) {
        st.upsert("events", { id: dup.id, googleId: undefined, googleEtag: undefined });
        st.remove("events", dup.id);
      }
    }
  }

  let pulled = 0;
  let pushed = 0;
  let removed = 0;
  let failed = 0;
  const touched = new Set<string>(); // local ids changed by this pull: don't push them straight back

  // 1. whole events and series first, then single occurrences (they need their series to exist)
  const instances = items.filter((g) => instanceInfo(g));
  for (const g of items.filter((x) => !instanceInfo(x))) {
    const local = byGid.get(g.id);
    if (g.status === "cancelled") {
      if (local && !local.deleted) {
        useStore.getState().remove("events", local.id);
        touched.add(local.id);
        removed++;
      }
      continue;
    }
    const mapped = fromGoogle(g);
    if (!mapped) continue;
    if (!local) {
      const rec = useStore.getState().upsert("events", { ...mapped, reminderMins: [st.settings.reminders.defaultEventMins] });
      byGid.set(g.id, rec);
      touched.add(rec.id);
      pulled++;
    } else if (!local.deleted && local.googleEtag !== g.etag && new Date(g.updated).getTime() > local.updatedAt) {
      // keep dates already skipped here (from single deleted occurrences) alongside any Google lists in the series itself
      const exceptions = [...new Set([...(local.exceptions ?? []), ...(mapped.exceptions ?? [])])];
      useStore.getState().upsert("events", { id: local.id, ...mapped, exceptions: exceptions.length ? exceptions : undefined });
      touched.add(local.id);
      pulled++;
    }
  }
  for (const g of instances) {
    const info = instanceInfo(g)!;
    const master = byGid.get(info.masterId);
    if (master && !master.deleted && !(master.exceptions ?? []).includes(info.date)) {
      useStore.getState().upsert("events", { id: master.id, exceptions: [...(master.exceptions ?? []), info.date] });
      touched.add(master.id);
    }
    const local = byGid.get(g.id);
    if (g.status === "cancelled") {
      if (local && !local.deleted) {
        useStore.getState().remove("events", local.id);
        touched.add(local.id);
      }
      continue;
    }
    // a moved or renamed single occurrence is its own event; the series skips its original date (above)
    const mapped = fromGoogle(g);
    if (!mapped) continue;
    if (!local) {
      const rec = useStore.getState().upsert("events", { ...mapped, reminderMins: [st.settings.reminders.defaultEventMins] });
      byGid.set(g.id, rec);
      touched.add(rec.id);
      pulled++;
    } else if (!local.deleted && local.googleEtag !== g.etag && new Date(g.updated).getTime() > local.updatedAt) {
      useStore.getState().upsert("events", { id: local.id, ...mapped });
      touched.add(local.id);
      pulled++;
    }
  }

  // 2. push local changes
  const now = new Date();
  const base = `${CAL}/${encodeURIComponent(calendarId)}/events`;
  for (const e of Object.values(useStore.getState().events)) {
    if (touched.has(e.id) || (e.source === "google" && !e.googleId)) continue;
    try {
      if (e.deleted) {
        if (e.googleId && e.updatedAt > lastCalendarSync) {
          await api(`${base}/${e.googleId}`, { method: "DELETE" }).catch((err) => {
            if (!isGone(err)) throw err;
          });
          pushed++;
        }
      } else if (!e.googleId) {
        if (fromYmd(e.end) < addDays(now, -60)) continue;
        const g = await api(base, { method: "POST", body: JSON.stringify(toGoogle(e)) });
        // upsert (not applyRemote) so the link also syncs to the phone and it doesn't push a duplicate
        useStore.getState().upsert("events", { id: e.id, googleId: g.id, googleEtag: g.etag });
        pushed++;
      } else if (e.updatedAt > lastCalendarSync) {
        const g = await api(`${base}/${e.googleId}`, { method: "PATCH", body: JSON.stringify(toGoogle(e)) });
        if (g) useStore.getState().upsert("events", { id: e.id, googleEtag: g.etag });
        else useStore.getState().upsert("events", { id: e.id, googleId: undefined, googleEtag: undefined });
        pushed++;
      }
    } catch (err) {
      if (e.googleId && !e.deleted && isGone(err)) {
        // not in this calendar (other account, or purged): unlink, so it's created again next time instead of lost
        useStore.getState().upsert("events", { id: e.id, googleId: undefined, googleEtag: undefined });
      } else if (/Google (401|403)\b|sign in/i.test((err as Error).message)) {
        throw err; // not a one-event problem: stop and tell the user
      } else failed++;
    }
  }

  useStore.getState().updateSettings((s) => {
    if (nextSyncToken) s.google.syncToken = nextSyncToken;
    if (!failed) s.google.lastCalendarSync = Date.now(); // failed pushes are retried because the watermark stays put
    s.google.lastCalendarSyncAt = Date.now();
  });
  return `Google Calendar synced: ${pulled} in, ${pushed} out${removed ? `, ${removed} removed` : ""}${failed ? `, ${failed} failed (will retry)` : ""}.`;
}
