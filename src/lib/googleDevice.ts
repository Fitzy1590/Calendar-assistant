import { useStore } from "../store";

/**
 * Google "device code" sign-in, for Android (which can't use the Windows loopback sign-in): the phone shows a short code,
 * you type it at google.com/device on any device, and the phone receives the sign-in. Google allows only a few permissions
 * in this flow; we ask only for the Drive app folder, which is all Drive sync needs. Calendar and Gmail stay Windows jobs.
 *
 * The protocol part is pure (network and clock are injected) so it is unit-tested; the app glue is at the bottom.
 */

export const DEVICE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export type Post = (url: string, form: Record<string, string>) => Promise<{ ok: boolean; json: any }>;
export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  url: string;
  expiresAt: number;
  interval: number; // seconds between checks
}
export interface Tokens {
  access: string;
  refresh?: string;
  expiresIn: number;
}
export interface Cancel {
  cancelled: boolean;
}

const why = (j: any) => String(j?.error_description || j?.error || "Google didn't accept that.");

export async function requestDeviceCode(post: Post, clientId: string, now = Date.now()): Promise<DeviceCode> {
  const r = await post(DEVICE_CODE_URL, { client_id: clientId, scope: DEVICE_SCOPE });
  if (!r.ok || !r.json?.device_code)
    throw new Error(
      r.json?.error === "invalid_client"
        ? "Google doesn't recognise that client ID. Check it is a “TVs and Limited Input devices” client."
        : why(r.json),
    );
  return {
    deviceCode: r.json.device_code,
    userCode: r.json.user_code,
    url: r.json.verification_url ?? r.json.verification_uri ?? "https://www.google.com/device",
    expiresAt: now + Number(r.json.expires_in ?? 1800) * 1000,
    interval: Math.max(1, Number(r.json.interval ?? 5)),
  };
}

/** Wait until the code has been entered on google.com/device (or it expires, is refused, or is cancelled). */
export async function pollForToken(
  post: Post,
  sleep: (ms: number) => Promise<void>,
  creds: { clientId: string; clientSecret: string },
  code: DeviceCode,
  cancel: Cancel = { cancelled: false },
  now: () => number = Date.now,
): Promise<Tokens> {
  let interval = code.interval;
  while (now() < code.expiresAt) {
    await sleep(interval * 1000);
    if (cancel.cancelled) throw new Error("Sign-in cancelled.");
    const r = await post(TOKEN_URL, {
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      device_code: code.deviceCode,
      grant_type: GRANT,
    });
    if (r.ok && r.json?.access_token)
      return { access: r.json.access_token, refresh: r.json.refresh_token, expiresIn: Number(r.json.expires_in ?? 3600) };
    const err = r.json?.error;
    if (err === "authorization_pending") continue;
    if (err === "slow_down") {
      interval += 5; // Google asks us to check less often
      continue;
    }
    if (err === "access_denied") throw new Error("Sign-in was cancelled on the Google page.");
    if (err === "expired_token") break;
    throw new Error(why(r.json));
  }
  throw new Error("The code expired. Start again for a new one.");
}

/** A fresh access token from the saved refresh token. "invalid_grant" means the sign-in was revoked or expired. */
export async function refreshAccess(post: Post, creds: { clientId: string; clientSecret: string }, refreshToken: string): Promise<Tokens> {
  const r = await post(TOKEN_URL, {
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!r.ok || !r.json?.access_token) throw new Error(r.json?.error === "invalid_grant" ? "invalid_grant" : why(r.json));
  return { access: r.json.access_token, refresh: r.json.refresh_token, expiresIn: Number(r.json.expires_in ?? 3600) };
}

/* ---------- app glue ---------- */

const KEY = "google-device-refresh"; // device-only, like the desktop sign-in's refresh token
let access: { value: string; expires: number } | null = null;

const tauriPost: Post = async (url, form) => {
  // native HTTP in the app: no CORS problems
  const { fetch: tfetch } = await import("@tauri-apps/plugin-http");
  const r = await tfetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
};
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
const creds = () => {
  const e = useStore.getState().settings.email;
  return { clientId: e.googleDeviceClientId.trim(), clientSecret: e.googleDeviceClientSecret.trim() };
};

export const deviceConfigured = () => !!(creds().clientId && creds().clientSecret);
export const deviceConnected = () => {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
};

/** Step 1: get a code to show. `done` resolves once it has been entered and the sign-in saved. */
export async function beginDeviceSignIn(): Promise<{ code: DeviceCode; done: Promise<void>; cancel: () => void }> {
  if (!deviceConfigured()) throw new Error("Add the client ID and secret for the “TVs and Limited Input devices” client first.");
  const c = creds();
  const code = await requestDeviceCode(tauriPost, c.clientId);
  const flag: Cancel = { cancelled: false };
  const done = pollForToken(tauriPost, sleep, c, code, flag).then((t) => {
    access = { value: t.access, expires: Date.now() + t.expiresIn * 1000 };
    if (t.refresh) localStorage.setItem(KEY, t.refresh);
  });
  return { code, done, cancel: () => void (flag.cancelled = true) };
}

/** An access token for Drive on this phone, refreshed from the saved sign-in. */
export async function deviceAccessToken(interactive: boolean): Promise<string> {
  if (access && access.expires > Date.now() + 60e3) return access.value;
  const refresh = localStorage.getItem(KEY);
  if (!refresh)
    throw new Error(
      interactive
        ? "Sign in with a code first: Settings → Phone & sync → Sync through Google Drive."
        : "Google needs you to sign in again.",
    );
  try {
    const t = await refreshAccess(tauriPost, creds(), refresh);
    access = { value: t.access, expires: Date.now() + t.expiresIn * 1000 };
    return t.access;
  } catch (e) {
    if ((e as Error).message === "invalid_grant") localStorage.removeItem(KEY);
    throw new Error("Google needs you to sign in again.");
  }
}

export function deviceDisconnect() {
  const r = localStorage.getItem(KEY);
  access = null;
  localStorage.removeItem(KEY);
  if (r) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(r)}`, { method: "POST" }).catch(() => {});
}
