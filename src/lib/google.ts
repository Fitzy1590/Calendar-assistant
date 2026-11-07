import { addDays, addMinutes } from "date-fns";
import type { CalEvent, Recurrence } from "../types";
import { live, useStore } from "../store";
import { conflictsFor } from "./planner";
import type { Candidate } from "./email";
import { fromYmd, localIso } from "./util";
import { isAndroid, isTauri, openUrl } from "./platform";

/**
 * Google sign-in, Google Calendar (import + two-way sync) and Google Drive backup.
 *
 * Two sign-in paths, picked automatically:
 *  - Installed Windows app: the "loopback" flow Google recommends for desktop apps. A tiny local
 *    server (tauri-plugin-oauth) listens on 127.0.0.1, the system browser opens Google's page, and the
 *    code comes back to the app (auth code + PKCE). A refresh token is kept on this device, so
 *    Calendar sync and Drive backup keep working in the background without signing in again.
 *  - Browser / dev build: token flow in a popup with a "Web application" client ID.
 * Android doesn't sign in itself: Google sync runs from the Windows app and reaches the phone via sync.
 */

export const SCOPES = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.events",
  drive: "https://www.googleapis.com/auth/drive.appdata", // hidden per-app folder: can't see your other files
};

const REFRESH_KEY = "google-refresh"; // device-only: never synced or backed up
let token: { value: string; expires: number; scopes: string } | null = null;

type Saved = { refresh: string; scopes: string };
const saved = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(REFRESH_KEY) || "null");
  } catch {
    return null;
  }
};

export const usesLoopback = () => isTauri() && !isAndroid();
export const googleSignInAvailable = () => !isAndroid();

export function googleConfigured() {
  const e = useStore.getState().settings.email;
  return usesLoopback() ? !!(e.googleDesktopClientId && e.googleDesktopClientSecret) : !!e.googleClientId;
}

/** True when a call needing `scope` can run without showing a sign-in window. */
export const googleConnected = (scope: string) =>
  (!!token && token.expires > Date.now() + 60e3 && token.scopes.includes(scope)) || (!!saved()?.scopes.includes(scope) && usesLoopback());

export function googleDisconnect() {
  const r = saved()?.refresh ?? token?.value;
  token = null;
  localStorage.removeItem(REFRESH_KEY);
  if (r) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(r)}`, { method: "POST" }).catch(() => {});
}

export async function googleToken(scopes: string[], interactive = true): Promise<string> {
  if (isAndroid()) throw new Error("Google sign-in runs from the Windows app; your events reach the phone through sync.");
  if (token && token.expires > Date.now() + 60e3 && scopes.every((s) => token!.scopes.includes(s))) return token.value;
  const sv = saved();
  if (usesLoopback() && sv && scopes.every((s) => sv.scopes.includes(s))) {
    const ok = await refresh(sv).catch(() => false);
    if (ok) return token!.value;
  }
  if (!interactive) throw new Error("Google needs you to sign in again.");
  if (!googleConfigured()) throw new Error("Add your Google client ID in Settings → Email, Google & Outlook first.");
  // ask for everything granted before plus the new scopes, so one sign-in covers them all
  const all = [...new Set([...(token?.scopes.split(" ") ?? []), ...(sv?.scopes.split(" ") ?? []), ...scopes])].join(" ");
  return usesLoopback() ? loopbackSignIn(all) : popupSignIn(all);
}

async function tokenRequest(body: Record<string, string>) {
  // native HTTP in the app: no CORS, and the client secret never touches a web origin
  const { fetch: tfetch } = await import("@tauri-apps/plugin-http");
  const r = await tfetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || `Google ${r.status}`);
  return j as { access_token: string; expires_in: number; refresh_token?: string; scope: string };
}

async function refresh(sv: Saved) {
  const e = useStore.getState().settings.email;
  const j = await tokenRequest({
    client_id: e.googleDesktopClientId,
    client_secret: e.googleDesktopClientSecret,
    refresh_token: sv.refresh,
    grant_type: "refresh_token",
  });
  token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000, scopes: j.scope || sv.scopes };
  return true;
}

async function pkce() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { verifier, challenge };
}

const DONE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Signed in</title></head>
<body style="font:16px system-ui;padding:48px;max-width:560px;margin:auto;color:#1d1b17;background:#f6f5f2">
<h2 style="margin:0 0 8px">Signed in to Calendar Assistant</h2><p>You can close this tab and go back to the app.</p></body></html>`;

async function loopbackSignIn(scopes: string): Promise<string> {
  const { start, onUrl, cancel } = await import("@fabianlars/tauri-plugin-oauth");
  const e = useStore.getState().settings.email;
  const port = await start({ response: DONE_PAGE });
  const redirect = `http://127.0.0.1:${port}`;
  const { verifier, challenge } = await pkce();
  const state = crypto.randomUUID();
  let unlisten: (() => void) | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Google sign-in timed out. Try again.")), 5 * 60e3);
      onUrl((u) => {
        clearTimeout(timer);
        resolve(u);
      }).then((fn) => (unlisten = fn), reject);
      openUrl(
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(e.googleDesktopClientId)}` +
          `&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&access_type=offline&prompt=consent` +
          `&include_granted_scopes=true&code_challenge=${challenge}&code_challenge_method=S256&state=${state}` +
          `&scope=${encodeURIComponent(scopes)}`,
      ).catch(reject);
    });
    const q = new URL(url).searchParams;
    if (q.get("error")) throw new Error(q.get("error") === "access_denied" ? "Google sign-in was cancelled." : q.get("error")!);
    if (q.get("state") !== state) throw new Error("Google sign-in response didn't match. Try again.");
    const j = await tokenRequest({
      client_id: e.googleDesktopClientId,
      client_secret: e.googleDesktopClientSecret,
      code: q.get("code")!,
      code_verifier: verifier,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    });
    token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000, scopes: j.scope || scopes };
    const keep = j.refresh_token ?? saved()?.refresh;
    if (keep) localStorage.setItem(REFRESH_KEY, JSON.stringify({ refresh: keep, scopes: token.scopes }));
    return token.value;
  } finally {
    unlisten?.();
    cancel(port).catch(() => {});
  }
}

async function popupSignIn(scopes: string): Promise<string> {
  const clientId = useStore.getState().settings.email.googleClientId;
  const res = await new Promise<{ hash: string }>((resolve, reject) => {
    const url =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(location.origin + "/oauth.html")}&response_type=token` +
      `&include_granted_scopes=true&scope=${encodeURIComponent(scopes)}`;
    const w = window.open(url, "oauth", "width=520,height=680");
    if (!w) return reject(new Error("Popup blocked"));
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== location.origin || ev.data?.type !== "oauth") return;
      window.removeEventListener("message", onMsg);
      clearInterval(t);
      resolve(ev.data);
    };
    window.addEventListener("message", onMsg);
    const t = setInterval(() => w.closed && (clearInterval(t), window.removeEventListener("message", onMsg), reject(new Error("Sign-in window closed"))), 500);
  });
  const p = new URLSearchParams(res.hash.slice(1));
  const value = p.get("access_token");
  if (!value) throw new Error(p.get("error") || "Google sign-in failed");
  token = { value, expires: Date.now() + Number(p.get("expires_in") || 3600) * 1000, scopes: p.get("scope") || scopes };
  return value;
}

let interactiveCalls = true;
/** Run Google calls without ever opening a sign-in window (background sync / backup). */
export async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  interactiveCalls = false;
  try {
    return await fn();
  } finally {
    interactiveCalls = true;
  }
}

async function gfetch(url: string, scope: string, init: RequestInit = {}) {
  const t = await googleToken([scope], interactiveCalls);
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (r.status === 401) token = null;
  if (!r.ok && r.status !== 204 && r.status !== 410) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 || r.status === 410 ? null : r.json();
}

/* ---------------- Google Calendar ---------------- */

const CAL = "https://www.googleapis.com/calendar/v3/calendars";

function rruleToRecurrence(rules?: string[]): Recurrence | undefined {
  const r = rules?.find((x) => x.startsWith("RRULE:"));
  if (!r) return undefined;
  const kv = Object.fromEntries(r.slice(6).split(";").map((p) => p.split("=")));
  const freq = ({ DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" } as const)[kv.FREQ as "DAILY"];
  if (!freq) return undefined;
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return {
    freq,
    interval: Number(kv.INTERVAL || 1),
    byWeekday: kv.BYDAY ? kv.BYDAY.split(",").map((d: string) => days.indexOf(d.slice(-2))).filter((d: number) => d >= 0) : undefined,
    until: kv.UNTIL ? `${kv.UNTIL.slice(0, 4)}-${kv.UNTIL.slice(4, 6)}-${kv.UNTIL.slice(6, 8)}` : undefined,
    count: kv.COUNT ? Number(kv.COUNT) : undefined,
  };
}

function recurrenceToRrule(r?: Recurrence): string[] | undefined {
  if (!r) return undefined;
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  let s = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval}`;
  if (r.byWeekday?.length) s += `;BYDAY=${r.byWeekday.map((d) => days[d]).join(",")}`;
  if (r.until) s += `;UNTIL=${r.until.replace(/-/g, "")}T235959Z`;
  if (r.count) s += `;COUNT=${r.count}`;
  return [s];
}

function fromGoogle(g: any): Partial<CalEvent> | null {
  if (g.status === "cancelled" || !g.start) return null;
  const allDay = !!g.start.date;
  const start = allDay ? fromYmd(g.start.date) : new Date(g.start.dateTime);
  const end = allDay ? fromYmd(g.end.date) : new Date(g.end.dateTime);
  return {
    title: g.summary || "(no title)",
    start: localIso(start),
    end: localIso(end),
    allDay,
    location: g.location,
    notes: g.description,
    recurrence: rruleToRecurrence(g.recurrence),
    googleId: g.id,
    googleEtag: g.etag,
    source: "google",
  };
}

function toGoogle(e: CalEvent) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    summary: e.title,
    location: e.location,
    description: e.notes,
    start: e.allDay ? { date: e.start.slice(0, 10) } : { dateTime: fromYmd(e.start).toISOString(), timeZone: tz },
    end: e.allDay ? { date: e.end.slice(0, 10) } : { dateTime: fromYmd(e.end).toISOString(), timeZone: tz },
    recurrence: recurrenceToRrule(e.recurrence),
  };
}

async function listGoogle(calendarId: string, from: Date, to: Date) {
  const out: any[] = [];
  let page = "";
  do {
    const j = await gfetch(
      `${CAL}/${encodeURIComponent(calendarId)}/events?maxResults=250&showDeleted=false&timeMin=${from.toISOString()}&timeMax=${to.toISOString()}${page ? `&pageToken=${page}` : ""}`,
      SCOPES.calendar,
    );
    out.push(...(j.items ?? []));
    page = j.nextPageToken ?? "";
  } while (page && out.length < 5000);
  return out;
}

/** One-off import: show Google events as candidates in the multi-select import dialog. */
export async function importGoogleCalendar(): Promise<Candidate[]> {
  const { calendarId } = useStore.getState().settings.google;
  const known = new Set(live(useStore.getState().events).map((e) => e.googleId).filter(Boolean));
  const items = await listGoogle(calendarId, new Date(), addDays(new Date(), 180));
  return items
    .filter((g) => !known.has(g.id))
    .map(fromGoogle)
    .filter((e): e is Partial<CalEvent> => !!e)
    .map((e) => {
      const start = fromYmd(e.start!);
      const end = fromYmd(e.end!);
      return {
        id: `gcal:${e.googleId}`,
        title: e.title!,
        start,
        end: end > start ? end : addMinutes(start, 60),
        allDay: !!e.allDay,
        location: e.location,
        source: "Google Calendar",
        conflicts: e.allDay ? [] : conflictsFor(start, end),
        googleId: e.googleId,
        recurrence: e.recurrence,
      } as Candidate;
    });
}

/**
 * Two-way sync. Pull: Google events in [-60d, +365d] are upserted locally (matched by googleId).
 * Push: local events with no googleId are created in Google; local edits newer than the last
 * sync are patched; local deletions of linked events are deleted in Google.
 */
export async function syncGoogleCalendar(): Promise<string> {
  const st = useStore.getState();
  const { calendarId, lastCalendarSync = 0 } = st.settings.google;
  const now = new Date();
  const remote = await listGoogle(calendarId, addDays(now, -60), addDays(now, 365));
  const byGid = new Map(Object.values(st.events).filter((e) => e.googleId).map((e) => [e.googleId!, e]));
  let pulled = 0;
  let pushed = 0;
  const seen = new Set<string>();

  for (const g of remote) {
    seen.add(g.id);
    const mapped = fromGoogle(g);
    if (!mapped) continue;
    const local = byGid.get(g.id);
    const remoteUpdated = new Date(g.updated).getTime();
    if (!local) {
      st.upsert("events", { ...mapped, reminderMins: [st.settings.reminders.defaultEventMins] });
      pulled++;
    } else if (!local.deleted && local.googleEtag !== g.etag && remoteUpdated > local.updatedAt) {
      st.upsert("events", { id: local.id, ...mapped });
      pulled++;
    }
  }

  const base = `${CAL}/${encodeURIComponent(calendarId)}/events`;
  for (const e of Object.values(useStore.getState().events)) {
    if (e.source === "google" && !e.googleId) continue;
    if (e.deleted) {
      if (e.googleId && e.updatedAt > lastCalendarSync) {
        await gfetch(`${base}/${e.googleId}`, SCOPES.calendar, { method: "DELETE" });
        pushed++;
      }
      continue;
    }
    if (!e.googleId) {
      if (fromYmd(e.end) < addDays(now, -60)) continue;
      const g = await gfetch(base, SCOPES.calendar, { method: "POST", body: JSON.stringify(toGoogle(e)) });
      // upsert (not applyRemote) so the link also syncs to the phone and it doesn't push a duplicate
      useStore.getState().upsert("events", { id: e.id, googleId: g.id, googleEtag: g.etag });
      pushed++;
    } else if (e.updatedAt > lastCalendarSync && seen.has(e.googleId)) {
      const g = await gfetch(`${base}/${e.googleId}`, SCOPES.calendar, { method: "PATCH", body: JSON.stringify(toGoogle(e)) });
      useStore.getState().upsert("events", { id: e.id, googleEtag: g.etag });
      pushed++;
    }
  }
  useStore.getState().updateSettings((s) => void (s.google.lastCalendarSync = Date.now()));
  return `Google Calendar synced: ${pulled} in, ${pushed} out.`;
}

/* ---------------- Google Drive backup (appDataFolder) ---------------- */

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const NAME = "calendar-assistant-backup.json";

async function findBackup(): Promise<{ id: string; modifiedTime: string } | undefined> {
  const j = await gfetch(`${DRIVE}?spaces=appDataFolder&q=${encodeURIComponent(`name='${NAME}'`)}&fields=files(id,modifiedTime)`, SCOPES.drive);
  return j.files?.[0];
}

export async function backupToDrive(json: string): Promise<string> {
  const existing = await findBackup();
  const boundary = "ca" + Math.random().toString(36).slice(2);
  const meta = existing ? {} : { name: NAME, parents: ["appDataFolder"] };
  const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
  await gfetch(existing ? `${UPLOAD}/${existing.id}?uploadType=multipart` : `${UPLOAD}?uploadType=multipart`, SCOPES.drive, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  useStore.getState().updateSettings((s) => void (s.google.lastDriveBackup = Date.now()));
  return "Backed up to Google Drive.";
}

export async function restoreFromDrive(): Promise<string | null> {
  const f = await findBackup();
  if (!f) return null;
  const t = await googleToken([SCOPES.drive], interactiveCalls);
  const r = await fetch(`${DRIVE}/${f.id}?alt=media`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`Drive ${r.status}`);
  return r.text();
}

