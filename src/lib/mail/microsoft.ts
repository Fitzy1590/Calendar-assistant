import { useStore } from "../../store";
import { pkce } from "../google";
import { httpGet } from "../http";
import { isAndroid, isTauri, openUrl } from "../platform";
import { secretDelete, secretGet, secretSet } from "../secureStore";
import { clearAccount } from "./cache";
import { fetchProfile, GRAPH, type GraphApi } from "./graph";
import type { MailAccountMeta } from "./types";

/**
 * Outlook / Hotmail sign-in (Microsoft identity platform): authorisation code + PKCE over a loopback address,
 * the same pattern as Google's desktop sign-in. A public client: no secret. Installed Windows app only.
 * The refresh token goes to the OS secure store (secureStore.ts); access tokens stay in memory.
 */

const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
/** Read-only for now. Moving, replying and sending will ask for more later (Mail.ReadWrite, Mail.Send). */
export const MS_SCOPES = "offline_access User.Read Mail.Read";

export const msSignInAvailable = () => isTauri() && !isAndroid();
export const msConfigured = () => !!useStore.getState().settings.email.microsoftClientId;

const access = new Map<string, { value: string; expires: number }>();
const refreshKey = (id: string) => `ms-refresh:${id}`;

const DONE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Signed in</title></head>
<body style="font:16px system-ui;padding:48px;max-width:560px;margin:auto;color:#1d1b17;background:#f6f5f2">
<h2 style="margin:0 0 8px">Signed in to Calendar Assistant</h2><p>You can close this tab and go back to the app.</p></body></html>`;

/** Microsoft's answer to a token request: the tokens, or an error that says what to fix. Pure. */
export function parseTokenResponse(status: number, text: string) {
  let j: any = {};
  try {
    j = JSON.parse(text);
  } catch {
    /* not JSON: fall through to the status */
  }
  if (status < 200 || status >= 300) {
    throw new Error(j.error === "invalid_grant" ? "invalid_grant" : j.error_description || j.error || `Microsoft ${status}`);
  }
  return j as { access_token: string; expires_in: number; refresh_token?: string };
}

async function tokenRequest(body: Record<string, string>) {
  // sent by the app itself (src-tauri/src/oauth_proxy.rs): the web view would add an Origin header, which Microsoft refuses
  const { invoke } = await import("@tauri-apps/api/core");
  const [status, text] = await invoke<[number, string]>("ms_token_request", { form: body });
  return parseTokenResponse(status, text);
}

/** Plain-English fixes for the Microsoft sign-in errors people actually hit while setting up their app. Pure. */
export function explainMicrosoftError(msg: string): string {
  const code = msg.match(/AADSTS(\d+)/)?.[1];
  const fixes: Record<string, string> = {
    "7000218": "In your Microsoft app (Entra → Authentication), turn on “Allow public client flows” and save.",
    "9002327":
      "In your Microsoft app (Entra → Authentication), the redirect `http://localhost` must be under “Mobile and desktop applications”, not Web or Single-page.",
    "50011": "In your Microsoft app (Entra → Authentication), add the redirect `http://localhost` under “Mobile and desktop applications”.",
    "700016": "Microsoft doesn't know that app ID. Check the Application (client) ID you pasted.",
    "50020": "Your Microsoft app must allow personal Microsoft accounts: Entra → Authentication → Supported account types.",
    "90023": "Microsoft refused the request as cross-origin. Update the app to the newest version.",
    "700025": "In your Microsoft app (Entra → Authentication), turn on “Allow public client flows” and save.",
    "65001": "Microsoft needs you to accept the permission. Press the button again and choose Accept.",
  };
  const fix = code && fixes[code];
  return fix ? `${fix} (Microsoft error ${code})` : msg;
}

/** Open Microsoft's sign-in page, wait for the redirect back, and return the tokens. */
async function loopbackSignIn(): Promise<{ access: string; refresh?: string; expiresIn: number }> {
  const { start, onUrl, cancel } = await import("@fabianlars/tauri-plugin-oauth");
  const clientId = useStore.getState().settings.email.microsoftClientId;
  const port = await start({ response: DONE_PAGE });
  const redirect = `http://localhost:${port}`;
  const { verifier, challenge } = await pkce();
  const state = crypto.randomUUID();
  let unlisten: (() => void) | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Outlook sign-in timed out. Try again.")), 5 * 60e3);
      onUrl((u) => (clearTimeout(timer), resolve(u))).then((fn) => (unlisten = fn), reject);
      openUrl(
        `${AUTH}/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&response_mode=query` +
          `&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(MS_SCOPES)}` +
          `&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&prompt=select_account`,
      ).catch(reject);
    });
    const q = new URL(url).searchParams;
    if (q.get("error"))
      throw new Error(
        q.get("error") === "access_denied" ? "Outlook sign-in was cancelled." : q.get("error_description") || q.get("error")!,
      );
    if (q.get("state") !== state) throw new Error("Outlook sign-in response didn't match. Try again.");
    const j = await tokenRequest({
      client_id: clientId,
      scope: MS_SCOPES,
      code: q.get("code")!,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    return { access: j.access_token, refresh: j.refresh_token, expiresIn: j.expires_in };
  } finally {
    unlisten?.();
    cancel(port).catch(() => {});
  }
}

async function accessToken(accountId: string): Promise<string> {
  const have = access.get(accountId);
  if (have && have.expires > Date.now() + 60e3) return have.value;
  const refresh = await secretGet(refreshKey(accountId));
  if (!refresh) throw new Error("invalid_grant");
  const j = await tokenRequest({
    client_id: useStore.getState().settings.email.microsoftClientId,
    scope: MS_SCOPES,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  access.set(accountId, { value: j.access_token, expires: Date.now() + j.expires_in * 1000 });
  if (j.refresh_token && j.refresh_token !== refresh) await secretSet(refreshKey(accountId), j.refresh_token);
  return j.access_token;
}

/** A Graph API function for one account: adds the token, retries once after a 401, null for 204/410. */
export function graphApi(getToken: () => Promise<string>, fetchFn: typeof fetch = fetch, onUnauthorised?: () => void): GraphApi {
  return async (url, init = {}) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetchFn(url, {
        ...init,
        headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (r.status === 401 && attempt === 0) {
        onUnauthorised?.();
        continue;
      }
      if (r.status === 204 || r.status === 410) return null;
      if (!r.ok) throw new Error(`Graph ${r.status}: ${(await r.text()).slice(0, 160)}`);
      return r.json();
    }
  };
}

/** Graph calls go through the app's own HTTP client, so the web view's cross-origin rules can't block them. */
const nativeFetch = ((url: RequestInfo | URL, init?: RequestInit) => httpGet(String(url), init)) as typeof fetch;

export const msApiFor = (accountId: string): GraphApi =>
  graphApi(
    () => accessToken(accountId),
    nativeFetch,
    () => access.delete(accountId),
  );

/** Sign in, learn who it is, and add the account. Returns it (the caller runs the first sync). */
export async function connectOutlook(): Promise<MailAccountMeta> {
  if (!msSignInAvailable()) throw new Error("Outlook sign-in runs in the installed Windows app.");
  if (!msConfigured()) throw new Error("Add your Microsoft app (client) ID first: Settings → Email.");
  let t: Awaited<ReturnType<typeof loopbackSignIn>>;
  try {
    t = await loopbackSignIn();
  } catch (e) {
    throw new Error(explainMicrosoftError((e as Error).message));
  }
  let profile: { address: string; name: string };
  try {
    profile = await fetchProfile(graphApi(async () => t.access, nativeFetch));
  } catch (e) {
    throw new Error(`Signed in, but couldn't read your profile from Outlook: ${(e as Error).message.slice(0, 160)}`);
  }
  if (!profile.address) throw new Error("Couldn't read your address from Outlook.");
  const existing = useStore.getState().settings.mail.accounts.find((a) => a.address === profile.address && a.provider === "graph");
  const id = existing?.id ?? crypto.randomUUID().slice(0, 8);
  access.set(id, { value: t.access, expires: Date.now() + t.expiresIn * 1000 });
  if (t.refresh) await secretSet(refreshKey(id), t.refresh);
  const meta: MailAccountMeta = {
    id,
    provider: "graph",
    address: profile.address,
    name: profile.name,
    enabled: true,
    status: "ok",
    deltaLink: undefined,
  };
  useStore.getState().updateSettings((s) => {
    const i = s.mail.accounts.findIndex((a) => a.id === id);
    if (i >= 0) s.mail.accounts[i] = meta;
    else s.mail.accounts.push(meta);
  });
  return meta;
}

/** Remove the account, its token and its cached mail. */
export async function disconnectOutlook(accountId: string): Promise<void> {
  access.delete(accountId);
  await secretDelete(refreshKey(accountId));
  await clearAccount(accountId);
  useStore.getState().updateSettings((s) => void (s.mail.accounts = s.mail.accounts.filter((a) => a.id !== accountId)));
}

export { GRAPH };
