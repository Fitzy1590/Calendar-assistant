/**
 * Microsoft "device code" sign-in, for Android (no loopback sign-in there): the phone shows a short code, you enter it at
 * microsoft.com/devicelogin on any device, and the phone receives the sign-in. The protocol is pure (network, sleep and
 * clock are injected) so it is unit-tested; microsoft.ts supplies the native Rust post.
 */

export const GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** Returns the HTTP status and parsed JSON body (empty object when it isn't JSON). */
export type MsPost = (kind: "devicecode" | "token", form: Record<string, string>) => Promise<{ status: number; json: any }>;
export interface MsDeviceCode {
  deviceCode: string;
  userCode: string;
  url: string;
  expiresAt: number;
  interval: number;
}
export interface MsTokens {
  access: string;
  refresh?: string;
  expiresIn: number;
}

const why = (j: any, status: number) => String(j?.error_description || j?.error || `Microsoft ${status}`);

export async function requestMsDeviceCode(post: MsPost, clientId: string, scope: string, now = Date.now()): Promise<MsDeviceCode> {
  const r = await post("devicecode", { client_id: clientId, scope });
  if (r.status < 200 || r.status >= 300 || !r.json?.device_code) throw new Error(why(r.json, r.status));
  return {
    deviceCode: r.json.device_code,
    userCode: r.json.user_code,
    url: r.json.verification_uri ?? "https://www.microsoft.com/link",
    expiresAt: now + Number(r.json.expires_in ?? 900) * 1000,
    interval: Math.max(1, Number(r.json.interval ?? 5)),
  };
}

/** Wait until the code has been entered (or it expires, is refused, or `cancel.cancelled` is set). */
export async function pollMsToken(
  post: MsPost,
  sleep: (ms: number) => Promise<void>,
  clientId: string,
  code: MsDeviceCode,
  cancel: { cancelled: boolean } = { cancelled: false },
  now: () => number = Date.now,
): Promise<MsTokens> {
  let interval = code.interval;
  while (now() < code.expiresAt) {
    await sleep(interval * 1000);
    if (cancel.cancelled) throw new Error("Sign-in cancelled.");
    const r = await post("token", { client_id: clientId, grant_type: GRANT, device_code: code.deviceCode });
    if (r.status >= 200 && r.status < 300 && r.json?.access_token)
      return { access: r.json.access_token, refresh: r.json.refresh_token, expiresIn: Number(r.json.expires_in ?? 3600) };
    const err = r.json?.error;
    if (err === "authorization_pending") continue;
    if (err === "slow_down") {
      interval += 5;
      continue;
    }
    if (err === "authorization_declined") throw new Error("Sign-in was cancelled on the Microsoft page.");
    if (err === "expired_token" || err === "bad_verification_code") break;
    throw new Error(why(r.json, r.status));
  }
  throw new Error("The code expired. Start again for a new one.");
}
