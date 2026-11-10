import { googleToken, SCOPES } from "../google";
import { isTauri } from "../platform";
import { secretGet } from "../secureStore";
import { allMessages } from "./cache";
import { gmailProvider, type GmailApi } from "./gmail";
import { graphProvider } from "./graph";
import { imapProvider, type ImapInvoke } from "./imap";
import { guessImap } from "./imapPresets";
import { msApiFor } from "./microsoft";
import type { MailProvider } from "./provider";
import type { MailAccountMeta } from "./types";

/** Picks the adapter for an account and wires it to its sign-in. */

export const imapPasswordKey = (accountId: string) => `imap-pass:${accountId}`;

export const tauriInvoke: ImapInvoke = async (cmd, args) => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(cmd, args) as never;
};

/** Gmail calls never open a sign-in window by themselves (background sync): the person signs in from Settings. */
export const gmailFetch: GmailApi = async (url, init = {}) => {
  const t = await googleToken([SCOPES.gmail], false);
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
  if (!r.ok && r.status !== 204) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
};

/** Gmail calls for sending: the token must carry the send permission. */
export const gmailSendFetch: GmailApi = async (url, init = {}) => {
  const t = await googleToken([SCOPES.gmailSend], false);
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers ?? {}) } });
  if (!r.ok && r.status !== 204) throw new Error(`Google ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
};

/** The outgoing server and password for a password account. */
export async function smtpCredsFor(a: MailAccountMeta) {
  const password = await secretGet(imapPasswordKey(a.id));
  if (!password || !a.imap) throw new Error("LOGIN failed: enter this account's password again in Settings → Email.");
  const guess = guessImap(a.address);
  return {
    host: a.imap.smtpHost || guess.smtpHost || `smtp.${a.address.split("@")[1]}`,
    port: a.imap.smtpPort || guess.smtpPort || 465,
    user: a.imap.user,
    password,
  };
}

export function providerFor(a: MailAccountMeta): MailProvider {
  if (a.provider === "gmail") return gmailProvider(gmailFetch);
  if (a.provider === "imap") {
    if (!isTauri()) throw new Error("Other email accounts need the installed Windows app.");
    return imapProvider({
      invoke: tauriInvoke,
      creds: async () => {
        const password = await secretGet(imapPasswordKey(a.id));
        if (!password || !a.imap) throw new Error("LOGIN failed: enter this account's password again.");
        return { ...a.imap, password };
      },
      known: async () =>
        (await allMessages())
          .filter((m) => m.accountId === a.id)
          .map((m) => Number(m.providerId))
          .filter((n) => Number.isFinite(n)),
    });
  }
  return graphProvider(msApiFor(a.id));
}
