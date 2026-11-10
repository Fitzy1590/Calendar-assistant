import type { InboxSync, MailProvider } from "./provider";
import type { MailAddr, RawMail } from "./types";

/**
 * IMAP adapter (read-only). The network and the mail parsing run natively in the Windows app (src-tauri/src/imap_*.rs);
 * this side maps the result. `invoke` is injected, so it is tested against a fake. The password comes from the secure store.
 */

export type ImapInvoke = <T>(cmd: string, args: Record<string, unknown>) => Promise<T>;
export interface ImapCreds {
  host: string;
  port: number;
  user: string;
  password: string;
}

interface NativeMail {
  uid: number;
  from?: MailAddr;
  to: MailAddr[];
  cc: MailAddr[];
  subject: string;
  date_ms: number;
  seen: boolean;
  preview: string;
  headers: Record<string, string>;
  importance?: string;
}
interface NativeSync {
  uid_validity: number;
  reset: boolean;
  messages: NativeMail[];
  seen: [number, boolean][];
  removed: number[];
}

export function mapImap(m: NativeMail, accountId: string): RawMail {
  return {
    id: `${accountId}:${m.uid}`,
    accountId,
    providerId: String(m.uid),
    threadId: String(m.uid),
    subject: m.subject?.trim() || "(no subject)",
    from: m.from ?? { address: "" },
    to: m.to ?? [],
    cc: m.cc ?? [],
    receivedAt: m.date_ms || 0,
    isRead: !!m.seen,
    preview: (m.preview ?? "").slice(0, 400),
    folder: "inbox",
    headers: m.headers ?? {},
    importance: m.importance === "high" || m.importance === "low" ? m.importance : "normal",
  };
}

export interface ImapDeps {
  invoke: ImapInvoke;
  creds: () => Promise<ImapCreds>;
  /** UIDs of this account's mail already in the cache. */
  known: () => Promise<number[]>;
}

export function imapProvider(deps: ImapDeps, sinceDays = 30): MailProvider {
  return {
    async sync(account) {
      const c = await deps.creds();
      const known = await deps.known();
      const r = await deps.invoke<NativeSync>("imap_sync", {
        req: { ...c, since_days: sinceDays, known_uids: known, known_validity: account.deltaLink ? Number(account.deltaLink) : null },
      });
      const out: InboxSync = {
        upserts: r.messages.map((m) => mapImap(m, account.id)),
        removedIds: r.removed.map((u) => `${account.id}:${u}`),
        readStates: r.seen.map(([u, s]) => ({ id: `${account.id}:${u}`, isRead: s })),
        deltaLink: String(r.uid_validity),
        initial: !account.deltaLink || r.reset,
      };
      return out;
    },
    async bodyText(providerId) {
      const c = await deps.creds();
      const r = await deps.invoke<{ text: string }>("imap_body", { req: { ...c, uid: Number(providerId) } });
      return r.text ?? "";
    },
  };
}

/** Check the address and password work, without saving anything. Throws a plain-English reason. */
export async function testImap(invoke: ImapInvoke, c: ImapCreds): Promise<void> {
  await invoke("imap_test", { req: c });
}
