import type { MailBucket, MailMessage, MailSettings, RawMail } from "./types";

/**
 * Decide a message's bucket and whether it is "important". Pure and local: nothing leaves the device.
 * Order: spam, subscriptions, financial, social, urgent, action, inbox. Junk and subscriptions are never important.
 */

export interface ClassifyContext {
  me: string; // the account's address
  contacts: Set<string>; // lower-case addresses of people in Contacts
  rules: MailSettings["important"];
}

const NEWSLETTER_SENDER =
  /^(no-?reply|noreply|donotreply|do-not-reply|newsletter|news|marketing|offers|deals|promotions?|mailer|updates?|info|hello|team|notifications?)([._+-]|@)/i;
const UNSUB_TEXT = /\bunsubscribe\b|view (this email )?in (your )?browser|manage (your )?(email )?(preferences|subscriptions)/i;
const SOCIAL_DOMAIN =
  /(^|\.)(facebookmail|facebook|linkedin|twitter|x|instagram|pinterest|reddit|redditmail|discord|tiktok|youtube|snapchat|quora|meetup|nextdoor|strava)\.com$/i;
const FINANCIAL_TEXT =
  /\b(invoice|receipt|statement|payment|paid|bill|billing|amount due|balance|transaction|direct debit|refund|subscription renewal|tax|bpay|bank|card ending|order (confirmation|#))\b/i;
const FINANCIAL_DOMAIN =
  /(^|\.)(paypal|stripe|square|wise|revolut|afterpay|zip|klarna|xero|myob|ato\.gov|commbank|anz|westpac|nab|chase|americanexpress|visa|mastercard)\./i;
// bills and bank notices that need you (a plain receipt does not)
const FINANCIAL_ALERT =
  /\b(overdue|past due|payment (is )?due|due (today|tomorrow|soon|on)|failed|declined|unsuccessful|unusual|suspicious|fraud|low balance|insufficient|final notice|reminder:? .*(bill|invoice|payment)|your bill is ready)\b/i;
const URGENT_TEXT =
  /\b(urgent|asap|immediately|right away|time[- ]sensitive|today|tonight|this (morning|afternoon|evening)|tomorrow|overdue|end of (the )?day|eod|deadline|final (notice|reminder))\b/i;
const ACTION_TEXT =
  /\b(please|could you|can you|would you|will you|need you to|i need|we need|let me know|get back to me|reply|respond|confirm|rsvp|approve|sign|review|send me|action required|waiting (for|on) you|follow(ing)? up|by (mon|tue|wed|thu|fri|sat|sun)[a-z]*|by (the )?\d{1,2}(st|nd|rd|th)?\b)\b/i;

const domainOf = (a: string) => a.split("@")[1]?.toLowerCase() ?? "";
const lc = (s: string) => s.toLowerCase();

export function classify(m: RawMail, ctx: ClassifyContext): Pick<MailMessage, "bucket" | "important" | "reasons"> {
  const reasons: string[] = [];
  const from = lc(m.from.address);
  const domain = domainOf(from);
  const text = `${m.subject}\n${m.preview}`;
  const fromContact = ctx.contacts.has(from);
  const direct = m.to.some((a) => lc(a.address) === lc(ctx.me)) || (!m.to.length && !m.cc.length);
  const h = m.headers;

  let bucket: MailBucket = "inbox";
  if (m.folder === "junk") {
    bucket = "spam";
    reasons.push("In the Junk folder");
  } else if (h["list-unsubscribe"] || h["list-id"] || /^(bulk|list|junk)$/i.test(h["precedence"] ?? "")) {
    bucket = "subscriptions";
    reasons.push("Sent as a mailing list or newsletter");
  } else if (!fromContact && NEWSLETTER_SENDER.test(from) && UNSUB_TEXT.test(m.preview)) {
    bucket = "subscriptions";
    reasons.push("Looks like a newsletter (unsubscribe link)");
  } else if (!fromContact && m.focused === false && UNSUB_TEXT.test(m.preview)) {
    bucket = "subscriptions";
    reasons.push("Outlook put it in Other and it has an unsubscribe link");
  } else if (FINANCIAL_DOMAIN.test(domain) || (FINANCIAL_TEXT.test(m.subject) && !fromContact)) {
    bucket = "financial";
    reasons.push("About money: a bill, receipt or bank notice");
  } else if (SOCIAL_DOMAIN.test(domain)) {
    bucket = "social";
    reasons.push("From a social or community site");
  } else if (
    !/^(no-?reply|noreply|do-?not-?reply)/i.test(from) &&
    direct &&
    (ACTION_TEXT.test(text) || /\?/.test(m.subject) || m.importance === "high")
  ) {
    const urgent = URGENT_TEXT.test(text) || m.importance === "high";
    bucket = urgent ? "urgent" : "action";
    reasons.push(urgent ? "Asks something and is time-sensitive" : "Asks you for something");
  }

  const quiet = bucket === "spam" || bucket === "subscriptions";
  let important = false;
  if (!quiet) {
    if (ctx.rules.actionUrgent && (bucket === "urgent" || bucket === "action")) important = true;
    if (ctx.rules.contacts && fromContact && bucket !== "social") {
      important = true;
      reasons.push("From someone in your Contacts");
    }
    if (ctx.rules.financial && bucket === "financial" && FINANCIAL_ALERT.test(text)) {
      important = true;
      reasons.push("A bill or bank alert that needs attention");
    }
    if (ctx.rules.everything && bucket !== "social") important = true;
  }
  return { bucket, important, reasons };
}

export const BUCKET_LABEL: Record<MailBucket, string> = {
  spam: "Junk",
  subscriptions: "Subscriptions",
  financial: "Financial",
  social: "Social",
  urgent: "Urgent",
  action: "Action required",
  inbox: "Inbox",
};
