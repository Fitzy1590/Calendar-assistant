import { addDays } from "date-fns";
import type { Subscription } from "../subscriptions";
import { fromYmd, ymd } from "../util";
import type { Cents } from "./types";

/** Subscription audit on top of lib/subscriptions.ts detection. Pure. */

export interface SubRecord {
  id: string;
  name: string;
  cents: Cents; // latest charge
  previousCents?: Cents;
  cadence: Subscription["cadence"];
  nextDate: string;
  trialEnds?: string;
  notified?: string[]; // alert ids already shown on this PC
}

export const ALERT_DAYS = 3;

/** Current charge is more than 3% above the previous one. Integer maths: now > prev * 1.03. */
export function isPriceHike(previousCents: Cents, currentCents: Cents): boolean {
  return previousCents > 0 && currentCents * 100 > previousCents * 103;
}

export function hikePercent(previousCents: Cents, currentCents: Cents): number {
  return Math.round(((currentCents - previousCents) * 100) / previousCents);
}

/** Monthly cost in cents, rounded to the nearest cent. */
export function monthlyCents(r: Pick<SubRecord, "cents" | "cadence">): Cents {
  const per = { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }[r.cadence];
  return Math.round(r.cents * per);
}

export function fromDetected(subs: Subscription[]): SubRecord[] {
  return subs
    .filter((s) => !s.hidden)
    .map((s) => ({
      id: s.id,
      name: s.name,
      cents: Math.round(s.amount * 100),
      previousCents: s.priceChange ? Math.round(s.priceChange.from * 100) : undefined,
      cadence: s.cadence,
      nextDate: s.nextDate,
    }));
}

export function priceHikes(records: SubRecord[]): SubRecord[] {
  return records.filter((r) => r.previousCents !== undefined && isPriceHike(r.previousCents, r.cents));
}

export interface SubAlert {
  id: string; // stable per subscription and event date, so a caller can remember it was shown
  kind: "trial" | "renewal";
  name: string;
  cents: Cents;
  on: string; // first day to alert (event - 3 days)
  date: string; // trial end or renewal date
}

/** Alerts to show today: from 3 days before a trial ends or a yearly plan renews, until that day. */
export function dueAlerts(records: SubRecord[], today: string): SubAlert[] {
  const out: SubAlert[] = [];
  const add = (r: SubRecord, kind: SubAlert["kind"], date: string) => {
    const on = ymd(addDays(fromYmd(date), -ALERT_DAYS));
    if (today >= on && today <= date) out.push({ id: `${r.id}:${kind}:${date}`, kind, name: r.name, cents: r.cents, on, date });
  };
  for (const r of records) {
    if (r.trialEnds) add(r, "trial", r.trialEnds);
    if (r.cadence === "yearly") add(r, "renewal", r.nextDate);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
