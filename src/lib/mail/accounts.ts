import { useStore } from "../../store";
import { googleToken, SCOPES } from "../google";
import { isAndroid, isTauri } from "../platform";
import { secretDelete, secretSet } from "../secureStore";
import { clearAccount } from "./cache";
import { gmailProfile } from "./gmail";
import { testImap, type ImapCreds } from "./imap";
import { explainImapError } from "./imapHelp";
import { disconnectOutlook } from "./microsoft";
import { gmailFetch, imapPasswordKey, tauriInvoke } from "./providers";
import type { MailAccountMeta } from "./types";

/** Adding and removing Gmail and IMAP accounts (Outlook is in microsoft.ts). Windows app only. */

export const otherMailAvailable = () => isTauri() && !isAndroid();

const save = (meta: MailAccountMeta) =>
  useStore.getState().updateSettings((s) => {
    const i = s.mail.accounts.findIndex((a) => a.id === meta.id);
    if (i >= 0) s.mail.accounts[i] = meta;
    else s.mail.accounts.push(meta);
  });

/** Sign in to Google with permission to read Gmail (the same Google sign-in as Calendar and Drive), then add the account. */
export async function connectGmail(): Promise<MailAccountMeta> {
  if (!otherMailAvailable()) throw new Error("Gmail sign-in runs in the installed Windows app.");
  await googleToken([SCOPES.gmail], true);
  const { address } = await gmailProfile(gmailFetch);
  if (!address) throw new Error("Couldn't read your Gmail address.");
  const existing = useStore.getState().settings.mail.accounts.find((a) => a.provider === "gmail" && a.address === address);
  const meta: MailAccountMeta = {
    id: existing?.id ?? "gmail-" + crypto.randomUUID().slice(0, 6),
    provider: "gmail",
    address,
    name: address,
    enabled: true,
    status: "ok",
  };
  save(meta);
  return meta;
}

/** Test the password, keep it in the secure store, and add the account. */
export async function connectImap(address: string, c: ImapCreds): Promise<MailAccountMeta> {
  if (!otherMailAvailable()) throw new Error("This runs in the installed Windows app.");
  const addr = address.trim().toLowerCase();
  if (!addr.includes("@")) throw new Error("Type the full email address.");
  if (!c.host.trim() || !c.password) throw new Error("Fill in the server and password.");
  // if the server can't be reached, quietly try the other likely settings for this provider before giving up
  let use = { ...c, host: c.host.trim(), user: c.user.trim() || addr };
  try {
    await testImap(tauriInvoke, use);
  } catch (first) {
    const fix = explainImapError(String(first instanceof Error ? first.message : first), addr);
    let worked = false;
    for (const alt of fix.kind === "server" ? fix.tryServers : []) {
      try {
        await testImap(tauriInvoke, { ...use, host: alt.host, port: alt.port });
        use = { ...use, host: alt.host, port: alt.port };
        worked = true;
        break;
      } catch {
        /* try the next one */
      }
    }
    if (!worked) throw first;
  }
  const existing = useStore.getState().settings.mail.accounts.find((a) => a.provider === "imap" && a.address === addr);
  const id = existing?.id ?? "imap-" + crypto.randomUUID().slice(0, 6);
  await secretSet(imapPasswordKey(id), c.password);
  const meta: MailAccountMeta = {
    id,
    provider: "imap",
    address: addr,
    name: addr,
    enabled: true,
    status: "ok",
    imap: { host: use.host, port: use.port, user: use.user },
  };
  save(meta);
  return meta;
}

/** Remove any account and the mail cached for it. Gmail keeps your Google sign-in (Calendar and Drive use it too). */
export async function disconnectAccount(a: MailAccountMeta): Promise<void> {
  if (a.provider === "graph") return disconnectOutlook(a.id);
  if (a.provider === "imap") await secretDelete(imapPasswordKey(a.id));
  await clearAccount(a.id);
  useStore.getState().updateSettings((s) => void (s.mail.accounts = s.mail.accounts.filter((x) => x.id !== a.id)));
}
