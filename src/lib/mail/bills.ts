import { addDays, format, getDay, parse, startOfDay } from "date-fns";

/** Pull an amount and a due date out of a bill email. Pure and local. Best effort: a miss just leaves the field empty. */

const CUR = String.raw`(?:AU?\$|US\$|NZ\$|\$|£|€)`;
const AMOUNT = new RegExp(String.raw`${CUR}\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{2})?|(\d+\.\d{2})\s?(?:AUD|USD|GBP|EUR|NZD)`, "gi");
const CUE = /(amount due|total due|balance due|total|amount|pay|payable|due|owing|owe)/i;

export function parseAmount(text: string): number | undefined {
  const found: { value: number; at: number }[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const whole = (m[1] ?? "").replace(/,/g, "");
    const value = m[3] ? Number(m[3]) : Number(whole + (m[2] ?? ""));
    if (Number.isFinite(value) && value > 0) found.push({ value, at: m.index ?? 0 });
  }
  if (!found.length) return undefined;
  // prefer an amount that follows or sits near words like "amount due" / "total"
  const near = found.find((f) => CUE.test(text.slice(Math.max(0, f.at - 40), f.at + 4)));
  return (near ?? found[0]).value;
}

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const monthIndex = (s: string) =>
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3).toLowerCase());
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** A date written near the word "due" in the text, as yyyy-MM-dd. `received` is when the email arrived (year and "tomorrow" are relative to it). */
export function parseDueDate(text: string, received = new Date()): string | undefined {
  const t = text.replace(/\s+/g, " ");
  const after = /\b(?:due(?: date)?|payable|pay by|pay on|payment (?:is )?due|by)\b[:\s]*(?:on |by |before )?/gi;
  const base = startOfDay(received);
  const fix = (d: Date) => {
    // no year written: this year, or next if that would be well before the email arrived
    if (d.getTime() < base.getTime() - 60 * 864e5) d.setFullYear(d.getFullYear() + 1);
    return ymd(d);
  };
  for (const m of t.matchAll(after)) {
    const rest = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 40);
    let r: RegExpMatchArray | null;
    if ((r = rest.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${r[1]}-${r[2]}-${r[3]}`;
    if ((r = rest.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/))) {
      const y = r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3]);
      return ymd(new Date(y, Number(r[2]) - 1, Number(r[1]))); // day first (Australia, UK)
    }
    if ((r = rest.match(new RegExp(String.raw`^(?:${DAYS.map((d) => d.slice(0, 3)).join("|")})[a-z]*,?\s*`, "i")))) {
      const tail = rest.slice(r[0].length);
      const inner = parseDueDate("due " + tail, received);
      if (inner) return inner;
    }
    if ((r = rest.match(new RegExp(String.raw`^(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTHS})\.?,?\s*(\d{4})?`, "i")))) {
      const d = new Date(r[3] ? Number(r[3]) : base.getFullYear(), monthIndex(r[2]), Number(r[1]));
      return r[3] ? ymd(d) : fix(d);
    }
    if ((r = rest.match(new RegExp(String.raw`^(${MONTHS})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?`, "i")))) {
      const d = new Date(r[3] ? Number(r[3]) : base.getFullYear(), monthIndex(r[1]), Number(r[2]));
      return r[3] ? ymd(d) : fix(d);
    }
    if (/^today\b/i.test(rest)) return ymd(base);
    if (/^tomorrow\b/i.test(rest)) return ymd(addDays(base, 1));
    if ((r = rest.match(new RegExp(String.raw`^(?:next |this )?(${DAYS.join("|")})\b`, "i")))) {
      const want = DAYS.indexOf(r[1].toLowerCase());
      return ymd(addDays(base, (want - getDay(base) + 7) % 7 || 7));
    }
  }
  return undefined;
}

export type DueState = "overdue" | "today" | "soon" | "later" | "unknown";

/** How close a due date is, for the label in the Bills tab. */
export function dueState(due: string | undefined, today = new Date()): { state: DueState; days: number } {
  if (!due) return { state: "unknown", days: 0 };
  const days = Math.round((startOfDay(parse(due, "yyyy-MM-dd", new Date())).getTime() - startOfDay(today).getTime()) / 864e5);
  return { state: days < 0 ? "overdue" : days === 0 ? "today" : days <= 3 ? "soon" : "later", days };
}

export function dueLabel(due: string | undefined, today = new Date()): string {
  const { state, days } = dueState(due, today);
  if (state === "unknown") return "No due date found";
  if (state === "overdue") return `Overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (state === "today") return "Due today";
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

const BILL_TEXT =
  /\b(bill|invoice|statement|amount due|payment due|due (on|by|date)|overdue|past due|pay now|balance due|please pay|payable)\b/i;
const RECEIPT_TEXT =
  /\b(receipt|payment received|thank you for your payment|payment (was )?successful|you paid|has been paid|paid in full|order confirmation|refund)\b/i;

/** Does this look like something to pay (not a receipt for something already paid)? */
export function looksLikeBill(subject: string, preview: string): boolean {
  const text = `${subject}\n${preview}`;
  return BILL_TEXT.test(text) && !RECEIPT_TEXT.test(text);
}

export const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
