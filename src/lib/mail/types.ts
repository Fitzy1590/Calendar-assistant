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
  /** Set by your rules or overrides. */
  notify?: boolean; // always send a desktop notification for this one
  muted?: boolean; // kept off Home and out of alerts
  bill?: boolean; // shows in the Bills tab
  amount?: number; // pulled from the email, when it can be
  dueDate?: string; // yyyy-MM-dd, pulled from the email, when it can be
  /** Local only, never written back to Outlook: */
  dismissed?: boolean; // seen or dismissed here
  paid?: boolean;
  paidAt?: number;
  override?: { important?: boolean; bill?: boolean; folderId?: string | null }; // "just this email" (folderId null = back to the Inbox)
  /** The folder this mail is filed in (by a rule or by hand). Folders live in this app only; your mailbox is not changed. */
  folderId?: string;
  linked?: { eventId?: string; taskId?: string }; // due date already added to Calendar / Tasks
  reminded?: string; // the due date a reminder was already sent for
  snoozedUntil?: number; // hidden from the lists and alerts until then (this device)
  followUpBy?: number; // remind me if nobody has replied by then (set when you send from here)
}

/** A rule you make. Sender and keywords must both match when both are given; for "either", make two rules. */
export interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  senders: string[]; // "sam@x.com", "@energyco.com" or "energyco.com"
  keywords: string[]; // looked for in the subject
  keywordMode: "any" | "all";
  important: boolean; // treat as important
  notify: boolean; // always notify
  mute: boolean; // never important, no alerts
  bill: boolean; // send to Bills
  folderId?: string; // file the mail in this app folder
}

/** "Remind me if nobody replies": set when you send a message from here. */
export interface FollowUp {
  id: string;
  accountId: string;
  threadId?: string;
  to: string[]; // addresses; a message from any of them after `sentAt` counts as a reply
  subject: string;
  sentAt: number;
  due: number;
}

/** A saved reply. {first name}, {name}, {date}, {time} are filled in. */
export interface MailTemplate {
  id: string;
  name: string;
  body: string;
}

/** A folder that exists in this app only. */
export interface MailFolder {
  id: string;
  name: string;
}

/** A message as the provider adapter returns it, before sorting. */
export type RawMail = Omit<MailMessage, "bucket" | "important" | "reasons">;

export interface MailAccountMeta {
  id: string;
  provider: "graph" | "gmail" | "imap";
  address: string;
  name: string;
  enabled: boolean;
  /** Where this provider left off: Graph's delta link, Gmail's historyId, IMAP's UIDVALIDITY. Opaque to the engine. */
  deltaLink?: string;
  /** IMAP only. The password is in the secure store, never here. smtp* is the outgoing server used for sending. */
  imap?: { host: string; port: number; user: string; smtpHost?: string; smtpPort?: number };
  /** This account has been allowed to send (Outlook Mail.Send, Gmail gmail.send, or an outgoing server for IMAP). */
  canSend?: boolean;
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
  rules: MailRule[];
  folders: MailFolder[];
  /** The right-click menu: the order of its items and the ones you hid. */
  menu: { order: string[]; hidden: string[] };
  templates: MailTemplate[];
  followUps: FollowUp[];
  signatures: Record<string, string>; // per account id
  undoSeconds: number; // how long Send waits so it can be undone
  aiConfirmed: { claude?: boolean; gemini?: boolean }; // you've seen what gets sent to this AI
  bills: { remindDays: number }; // remind this many days before an unpaid bill is due (0 = off)
  /** How often you changed a sender by hand, to suggest making it a rule. */
  suggest: { counts: Record<string, Partial<Record<"important" | "mute" | "bill", number>>>; dismissed: string[] };
  lastDigestOn?: string; // yyyy-mm-dd of the last daily summary
}

export const DEFAULT_MAIL_SETTINGS: MailSettings = {
  accounts: [],
  pollMins: 3,
  cacheText: true,
  cacheMaxMB: 300,
  important: { actionUrgent: true, contacts: true, financial: true, everything: false },
  alerts: { homeCard: true, desktop: true, badge: true, dailySummary: true, summaryHour: 8 },
  rules: [],
  folders: [],
  menu: { order: [], hidden: [] },
  templates: [],
  followUps: [],
  signatures: {},
  undoSeconds: 10,
  aiConfirmed: {},
  bills: { remindDays: 2 },
  suggest: { counts: {}, dismissed: [] },
};
