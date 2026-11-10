import type { RawMail } from "./types";

/** What a provider hands the engine after looking at one account. */
export interface InboxSync {
  upserts: RawMail[];
  removedIds: string[]; // full ids (`account:provider`)
  deltaLink?: string; // the provider's bookmark, stored on the account
  initial: boolean; // first sync (or a fresh start): don't alert for the backlog
  /** Read/unread changes for mail already cached (providers that can't send changed messages). */
  readStates?: { id: string; isRead: boolean }[];
}

/** One mail provider (Outlook, Gmail, IMAP) for one account. The engine never sees anything provider-specific. */
export interface MailProvider {
  sync(account: { id: string; deltaLink?: string }): Promise<InboxSync>;
  bodyText(providerId: string): Promise<string>;
}
