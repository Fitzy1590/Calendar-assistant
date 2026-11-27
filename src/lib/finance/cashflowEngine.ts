import { addDays, addMonths, addWeeks, addYears, getDay } from "date-fns";
import { fromYmd, ymd } from "../util";
import type { CashItem, Every, FinAccount, ProjectedDay, Schedule } from "./types";

/** Predictive cash flow. Pure: no network, no store. Projected(t) = opening + income(<= t) - bills(<= t). */

/** Payday on Sat/Sun moves back to Friday; a bill on Sat/Sun moves on to Monday. */
export function shiftWeekend(date: string, kind: "income" | "bill"): string {
  const d = fromYmd(date);
  const wd = getDay(d);
  if (wd === 6) return ymd(addDays(d, kind === "income" ? -1 : 2));
  if (wd === 0) return ymd(addDays(d, kind === "income" ? -2 : 1));
  return date;
}

const STEP: Record<Exclude<Every, "once">, (d: Date, n: number) => Date> = {
  weekly: (d, n) => addWeeks(d, n),
  fortnightly: (d, n) => addWeeks(d, 2 * n),
  monthly: (d, n) => addMonths(d, n), // from the first date each time: the 31st clamps to month end, no drift
  yearly: (d, n) => addYears(d, n),
};

/** Due dates of one schedule inside [from, to] inclusive. */
export function dueDates(s: Schedule, from: string, to: string): string[] {
  const start = fromYmd(s.start);
  const out: string[] = [];
  const last = s.until && s.until < to ? s.until : to;
  if (s.every === "once") return s.start >= from && s.start <= last ? [s.start] : [];
  for (let i = 0; i < 5000; i++) {
    const day = ymd(STEP[s.every](start, i));
    if (day > last) break;
    if (day >= from) out.push(day);
  }
  return out;
}

/** Items whose balance effect lands in [from, to] (after the weekend shift), oldest first. */
export function expand(schedules: Schedule[], from: string, to: string): CashItem[] {
  // a shift moves a date by at most 2 days, so look 3 days either side and then filter on the shifted date
  const lo = ymd(addDays(fromYmd(from), -3));
  const hi = ymd(addDays(fromYmd(to), 3));
  const out: CashItem[] = [];
  for (const s of schedules) {
    for (const due of dueDates(s, lo, hi)) {
      const effective = shiftWeekend(due, s.kind);
      if (effective < from || effective > to) continue;
      out.push({ id: `${s.id}@${due}`, accountId: s.accountId, name: s.name, kind: s.kind, cents: s.cents, due, effective });
    }
  }
  return out.sort((a, b) => a.effective.localeCompare(b.effective) || a.id.localeCompare(b.id));
}

/**
 * Day-by-day projection from `from` to `to` inclusive. The opening balance is the balance at the start of `from`,
 * so items dated `from` still count. `accountId` limits it to one account, otherwise all accounts are added together.
 * A day is "low" below `bufferCents` and "overdraft" below zero (an overdraft day is not also "low").
 */
export function project(
  accounts: FinAccount[],
  schedules: Schedule[],
  from: string,
  to: string,
  bufferCents: number,
  accountId?: string,
): ProjectedDay[] {
  const ids = new Set(accounts.filter((a) => !accountId || a.id === accountId).map((a) => a.id));
  let balance = accounts.filter((a) => ids.has(a.id)).reduce((n, a) => n + a.openingCents, 0);
  const items = expand(
    schedules.filter((s) => ids.has(s.accountId)),
    from,
    to,
  );
  const byDay = new Map<string, CashItem[]>();
  for (const it of items) byDay.set(it.effective, [...(byDay.get(it.effective) ?? []), it]);
  const days: ProjectedDay[] = [];
  for (let d = fromYmd(from), end = fromYmd(to); d <= end; d = addDays(d, 1)) {
    const date = ymd(d);
    const todays = byDay.get(date) ?? [];
    const delta = todays.reduce((n, i) => n + (i.kind === "income" ? i.cents : -i.cents), 0);
    balance += delta;
    days.push({
      date,
      balanceCents: balance,
      deltaCents: delta,
      flags: balance < 0 ? ["overdraft"] : balance < bufferCents ? ["low"] : [],
      items: todays,
    });
  }
  return days;
}
