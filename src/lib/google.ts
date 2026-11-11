import { addDays, addMinutes } from "date-fns";
import type { CalEvent } from "../types";
import { live, useStore } from "../store";
import { conflictsFor } from "./planner";
import type { Candidate } from "./email";
import { fromYmd } from "./util";
import { fromGoogle } from "./googleMap";
import { CAL, syncCalendarWith } from "./googleSync";
import { deviceAccessToken, deviceConnected, deviceDisconnect } from "./googleDevice";
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
  gmailSend: "https://www.googleapis.com/auth/gmail.send", // send mail you write here; it can't read or delete
  calendar: "https://www.googleapis.com/auth/calendar.events",
  drive: "https://www.googleapis.com/auth/drive.file", // only files this app created: can't see your other files
  contacts: "https://www.googleapis.com/auth/contacts.readonly", // names, numbers and birthdays for "Sync birthdays"
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
  (isAndroid() && scope === SCOPES.drive && deviceConnected()) ||
  (!!token && token.expires > Date.now() + 60e3 && token.scopes.includes(scope)) ||
  (!!saved()?.scopes.includes(scope) && usesLoopback());

export function googleDisconnect() {
  const r = saved()?.refresh ?? token?.value;
  token = null;
  localStorage.removeItem(REFRESH_KEY);
  deviceDisconnect();
  // the sync token belongs to the account: the next one starts with a full sync
  useStore.getState().updateSettings((s) => void (s.google.syncToken = undefined));
  if (r) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(r)}`, { method: "POST" }).catch(() => {});
}

export async function googleToken(scopes: string[], interactive = true): Promise<string> {
  if (isAndroid()) {
    // the phone signs in by device code, for Drive sync only; Calendar and Gmail run from the Windows app
    if (scopes.every((s) => s === SCOPES.drive)) return deviceAccessToken(interactive);
    throw new Error("Google Calendar and Gmail run from the Windows app; your events reach the phone through sync.");
  }
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

export async function pkce() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
    const t = setInterval(
      () => w.closed && (clearInterval(t), window.removeEventListener("message", onMsg), reject(new Error("Sign-in window closed"))),
      500,
    );
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

export async function gfetch(url: string, scope: string, init: RequestInit = {}) {
  const t = await googleToken([scope], interactiveCalls);
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 401) token = null;
  if (!r.ok && r.status !== 204 && r.status !== 410) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 || r.status === 410 ? null : r.json();
}

/* ---------------- Google Calendar ---------------- */

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
  const known = new Set(
    live(useStore.getState().events)
      .map((e) => e.googleId)
      .filter(Boolean),
  );
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

/** Google Calendar two-way sync: the engine is in googleSync.ts; this connects it to the signed-in Google API. */
export const syncGoogleCalendar = () => syncCalendarWith((url, init) => gfetch(url, SCOPES.calendar, init));

/** One click: sign in if needed, switch automatic sync on, and sync now. */
export async function googleCalendarOneClick(): Promise<string> {
  await googleToken([SCOPES.calendar]);
  useStore.getState().updateSettings((s) => void (s.google.calendarSync = true));
  return syncGoogleCalendar();
}

/* ---------------- Google Drive backup + sync folder (drive.file) ---------------- */

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const NAME = "calendar-assistant-backup.json";

const FOLDER_NAME = "Calendar Assistant (sync)";
let folderId: string | undefined;

/** The one folder this app keeps in My Drive. With drive.file the app only ever sees what it created itself. */
export async function appFolderId(): Promise<string> {
  if (folderId) return folderId;
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const j = await gfetch(`${DRIVE}?q=${q}&fields=files(id)`, SCOPES.drive);
  folderId = j?.files?.[0]?.id;
  if (!folderId) {
    const c = await gfetch(`${DRIVE}?fields=id`, SCOPES.drive, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    });
    folderId = c.id as string;
  }
  return folderId;
}

async function findBackup(): Promise<{ id: string; modifiedTime: string } | undefined> {
  const parent = await appFolderId();
  const q = encodeURIComponent(`name='${NAME}' and '${parent}' in parents and trashed=false`);
  const j = await gfetch(`${DRIVE}?q=${q}&fields=files(id,modifiedTime)`, SCOPES.drive);
  return j.files?.[0];
}

export async function backupToDrive(json: string): Promise<string> {
  const existing = await findBackup();
  const boundary = "ca" + Math.random().toString(36).slice(2);
  const meta = existing ? {} : { name: NAME, parents: [await appFolderId()] };
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

/* ---------------- Google Contacts (birthdays) ---------------- */

/**
 * Pull names, phone numbers, emails and birthdays from Google Contacts. Existing contacts are matched by
 * name (then phone/email) and only get the fields they are missing; new people with a birthday are added.
 */
export async function syncGoogleContacts(): Promise<string> {
  const st = useStore.getState();
  const people: any[] = [];
  let page = "";
  do {
    const j = await gfetch(
      `https://people.googleapis.com/v1/people/me/connections?pageSize=1000&personFields=names,birthdays,phoneNumbers,emailAddresses${page ? `&pageToken=${page}` : ""}`,
      SCOPES.contacts,
    );
    people.push(...(j.connections ?? []));
    page = j.nextPageToken ?? "";
  } while (page && people.length < 5000);

  const mine = Object.values(st.contacts).filter((c) => !c.deleted);
  const norm = (v?: string) => (v ?? "").replace(/[^\d+]/g, "");
  let added = 0;
  let updated = 0;
  for (const p of people) {
    const name: string | undefined = p.names?.[0]?.displayName;
    if (!name) continue;
    const b = p.birthdays?.find((x: any) => x.date?.month && x.date?.day)?.date;
    const birthday = b ? `${b.year ?? 1900}-${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}` : undefined;
    const phone: string | undefined = p.phoneNumbers?.[0]?.value;
    const email: string | undefined = p.emailAddresses?.[0]?.value;
    const match =
      mine.find((c) => c.name.toLowerCase() === name.toLowerCase()) ||
      (phone ? mine.find((c) => c.phone && norm(c.phone) === norm(phone)) : undefined) ||
      (email ? mine.find((c) => c.email?.toLowerCase() === email.toLowerCase()) : undefined);
    if (match) {
      const patch: Record<string, string> = {};
      if (birthday && !match.birthday) patch.birthday = birthday;
      if (phone && !match.phone) patch.phone = phone;
      if (email && !match.email) patch.email = email;
      if (Object.keys(patch).length) {
        st.upsert("contacts", { id: match.id, ...patch });
        updated++;
      }
    } else if (birthday) {
      st.upsert("contacts", { name, birthday, phone, email });
      added++;
    }
  }
  return `Google Contacts: ${added} added, ${updated} updated.`;
}
