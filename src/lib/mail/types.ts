/** Mail shapes. Mail lives in IndexedDB on this device (see cache.ts), never in the synced store. */

export type MailBucket = "spam" | "subscriptions" | "financial" | "social" | "urgent" | "action" | "inbox";

export interface MailAddr {
  name?: string;
  address: string;
}

export interface MailMessage {
  id: string; // `${accountId}:${providerId}`
  accountId: string;
  providerId: string;
  threadId: string;
  subject: string;
  from: MailAddr;
  to: MailAddr[];
  cc: MailAddr[];
  receivedAt: number; // ms
  isRead: boolean;
  preview: string;
  text?: string; // full text, only when the cache keeps message text
  folder: "inbox" | "junk";
  /** Subset of headers, lower-case keys: list-unsubscribe, list-id, precedence, auto-submitted. */
  headers: Record<string, string>;
  importance?: "low" | "normal" | "high"; // the sender's flag
  focused?: boolean; // Outlook's own Focused/Other split
  bucket: MailBucket;
  important: boolean;
  reasons: string[]; // why it was sorted this way (shown in the reader)
  dismissed?: boolean; // seen or dismissed here (local only: never written back to Outlook)
}

/** A message as the provider adapter returns it, before sorting. */
export type RawMail = Omit<MailMessage, "bucket" | "important" | "reasons">;

export interface MailAccountMeta {
  id: string;
  provider: "graph";
  address: string;
  name: string;
  enabled: boolean;
  deltaLink?: string; // Graph's "changes since" bookmark
  lastSyncAt?: number;
  status: "ok" | "needs-reconnect" | "error";
  error?: string;
}

export interface MailSettings {
  accounts: MailAccountMeta[];
  pollMins: number;
  cacheText: boolean; // keep message text on this device (off = metadata and preview only)
  cacheMaxMB: number;
  /** Which mail counts as important. */
  important: { actionUrgent: boolean; contacts: boolean; financial: boolean; everything: boolean };
  /** How important mail shows up. */
  alerts: { homeCard: boolean; desktop: boolean; badge: boolean; dailySummary: boolean; summaryHour: number };
  lastDigestOn?: string; // yyyy-mm-dd of the last daily summary
}

export const DEFAULT_MAIL_SETTINGS: MailSettings = {
  accounts: [],
  pollMins: 3,
  cacheText: true,
  cacheMaxMB: 300,
  important: { actionUrgent: true, contacts: true, financial: true, everything: false },
  alerts: { homeCard: true, desktop: true, badge: true, dailySummary: true, summaryHour: 8 },
};
