import { format } from "date-fns";
import { parseAddrList } from "./headers";
import type { MailAddr, MailMessage, MailTemplate } from "./types";

/** Writing mail: who a reply goes to, the quoted text, templates, and the checks before Send. Pure, so it is tested. */

export type ComposeMode = "reply" | "replyAll" | "forward" | "new";

export interface Attachment {
  name: string;
  mime: string;
  data: string; // base64
  size: number;
}

export interface OutgoingMail {
  id: string;
  accountId: string;
  mode: ComposeMode;
  to: MailAddr[];
  cc: MailAddr[];
  bcc: MailAddr[];
  subject: string;
  body: string; // plain text, signature and quote included
  /** What this answers, so it threads in the other person's mail app. */
  reply?: { providerId: string; threadId: string };
  attachments: Attachment[];
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const GRAPH_ATTACHMENT_BYTES = 3 * 1024 * 1024; // Outlook takes files this size inside the message

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
export const validAddress = (a: string) => EMAIL.test(a.trim());

export function subjectFor(mode: ComposeMode, subject: string): string {
  const s = subject.trim();
  if (mode === "forward") return /^(fwd?|fw):/i.test(s) ? s : `Fwd: ${s}`;
  if (mode === "reply" || mode === "replyAll") return /^re:/i.test(s) ? s : `Re: ${s}`;
  return s;
}

const dedupe = (list: MailAddr[], skip: Set<string>) => {
  const seen = new Set(skip);
  return list.filter((a) => {
    const k = a.address.toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Who a reply goes to: the sender, or everyone (never you, never twice). A forward starts empty. */
export function recipientsFor(
  mode: ComposeMode,
  m: Pick<MailMessage, "from" | "to" | "cc">,
  me: string,
): { to: MailAddr[]; cc: MailAddr[] } {
  const self = new Set([me.toLowerCase()]);
  if (mode === "forward" || mode === "new") return { to: [], cc: [] };
  if (mode === "reply") return { to: dedupe([m.from], self), cc: [] };
  const to = dedupe([m.from, ...m.to], self);
  return { to, cc: dedupe(m.cc, new Set([...self, ...to.map((a) => a.address.toLowerCase())])) };
}

const who = (a: MailAddr) => (a.name ? `${a.name} <${a.address}>` : a.address);

/** The original, quoted the way mail apps do it. */
export function quoteOf(mode: ComposeMode, m: Pick<MailMessage, "from" | "to" | "subject" | "receivedAt" | "text" | "preview">): string {
  const text = (m.text || m.preview || "").trim();
  if (mode === "forward")
    return [
      "---------- Forwarded message ----------",
      `From: ${who(m.from)}`,
      `Date: ${format(m.receivedAt, "EEE d MMM yyyy, h:mm a")}`,
      `Subject: ${m.subject}`,
      m.to.length ? `To: ${m.to.map(who).join(", ")}` : "",
      "",
      text,
    ]
      .filter((l, i) => l !== "" || i === 5)
      .join("\n");
  return (
    `On ${format(m.receivedAt, "EEE d MMM yyyy, h:mm a")}, ${who(m.from)} wrote:\n` +
    text
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n")
  );
}

/** A new draft for a reply or forward: cursor space on top, then your signature, then the quoted original. */
export function startCompose(
  mode: ComposeMode,
  m: Pick<MailMessage, "from" | "to" | "cc" | "subject" | "receivedAt" | "text" | "preview" | "providerId" | "threadId" | "accountId">,
  me: string,
  signature = "",
): OutgoingMail {
  const r = recipientsFor(mode, m, me);
  return {
    id: crypto.randomUUID().slice(0, 10),
    accountId: m.accountId,
    mode,
    to: r.to,
    cc: r.cc,
    bcc: [],
    subject: subjectFor(mode, m.subject),
    body: `\n\n${signature ? `${signature.trim()}\n\n` : ""}${quoteOf(mode, m)}`,
    reply: { providerId: m.providerId, threadId: m.threadId },
    attachments: [],
  };
}

export const startNew = (accountId: string, signature = ""): OutgoingMail => ({
  id: crypto.randomUUID().slice(0, 10),
  accountId,
  mode: "new",
  to: [],
  cc: [],
  bcc: [],
  subject: "",
  body: signature ? `\n\n${signature.trim()}` : "",
  attachments: [],
});

/** Everything above your quoted text: the part you wrote (used for checks and for sending to an AI). */
export const ownText = (body: string) => body.split(/\n(?:On .+ wrote:|-{5,} Forwarded message -{5,})/)[0];

/** Fill a template in for this recipient. Unknown {fill-ins} are left as they are. */
export function fillTemplate(t: Pick<MailTemplate, "body">, to?: MailAddr, now = new Date()): string {
  const name = to?.name || "";
  const first = name.split(/\s+/)[0] || "there";
  const vars: Record<string, string> = {
    "first name": first,
    name: name || first,
    date: format(now, "EEEE d MMMM"),
    time: format(now, "h:mm a"),
  };
  return t.body.replace(/\{([a-z ]+)\}/gi, (m, k: string) => vars[k.toLowerCase()] ?? m);
}

export const unresolvedChecks = (body: string): string[] => [...body.matchAll(/\[CHECK:([^\]]*)\]/g)].map((m) => m[1].trim());

export interface SendCheck {
  level: "ok" | "warn" | "block";
  text: string;
}

const ATTACH_WORDS = /\b(attach(ed|ment|ments|ing)?|enclosed|see the (file|document|pdf))\b/i;

/** The checklist shown before a message goes out. "block" stops Send; "warn" lets you send anyway. */
export function checkBeforeSend(d: OutgoingMail, contacts: Set<string> = new Set()): SendCheck[] {
  const out: SendCheck[] = [];
  const all = [...d.to, ...d.cc, ...d.bcc];
  const bad = all.filter((a) => !validAddress(a.address));
  if (!d.to.length && !d.cc.length && !d.bcc.length) out.push({ level: "block", text: "Add at least one recipient." });
  else if (bad.length) out.push({ level: "block", text: `Not a valid address: ${bad.map((a) => a.address).join(", ")}` });
  else {
    const strangers = all.filter((a) => !contacts.has(a.address.toLowerCase()));
    out.push({
      level: "ok",
      text: `To: ${all.map((a) => a.address).join(", ")}${strangers.length === all.length ? " (not in your Contacts)" : ""}`,
    });
  }
  const unresolved = unresolvedChecks(d.body);
  if (unresolved.length)
    out.push({
      level: "block",
      text: `The draft has ${unresolved.length} thing${unresolved.length === 1 ? "" : "s"} to check first: ${unresolved.join("; ")}`,
    });
  if (!ownText(d.body).trim() && d.mode !== "forward") out.push({ level: "block", text: "The message is empty." });
  if (!d.subject.trim()) out.push({ level: "warn", text: "No subject." });
  else out.push({ level: "ok", text: "Subject filled in" });
  if (ATTACH_WORDS.test(ownText(d.body)) && !d.attachments.length)
    out.push({ level: "warn", text: "Mentions an attachment, but no file is attached." });
  if (d.to.length + d.cc.length > 8) out.push({ level: "warn", text: `This goes to ${d.to.length + d.cc.length} people.` });
  const big = d.attachments.reduce((n, a) => n + a.size, 0);
  if (big > MAX_ATTACHMENT_BYTES) out.push({ level: "block", text: "Attachments are over 10 MB in total." });
  return out;
}

export const canSendNow = (checks: SendCheck[]) => !checks.some((c) => c.level === "block");

/** The addresses typed into a "To" box. */
export const parseRecipients = (text: string): MailAddr[] => parseAddrList(text.replace(/;/g, ","));
export const recipientsText = (list: MailAddr[]) => list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");

/** Put new text where you write (above the signature and the quoted original), keeping both. */
export function withDraft(body: string, text: string, signature = ""): string {
  const quote = body.slice(ownText(body).length);
  return `${text.trim()}\n\n${signature.trim() ? `${signature.trim()}\n\n` : ""}${quote.replace(/^\n+/, "")}`.replace(
    /\n+$/,
    quote ? "\n" : "",
  );
}
