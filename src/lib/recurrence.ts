import {
  addDays, addMonths, addWeeks, addYears, differenceInMinutes, getDay, isAfter, isBefore, startOfDay, startOfWeek,
} from "date-fns";
import type { CalEvent } from "../types";
import { fromYmd, localIso, ymd } from "./util";

export interface Occurrence {
  event: CalEvent;
  start: Date;
  end: Date;
  key: string; // eventId@yyyy-mm-dd, stable per instance
}

const MAX_ITER = 5000;

/** Expand an event (single or recurring) into concrete occurrences overlapping [from, to). */
export function occurrences(ev: CalEvent, from: Date, to: Date): Occurrence[] {
  if (ev.deleted) return [];
  const start0 = fromYmd(ev.start);
  const end0 = fromYmd(ev.end);
  const dur = Math.max(differenceInMinutes(end0, start0), 0);
  const make = (s: Date): Occurrence => ({
    event: ev,
    start: s,
    end: new Date(s.getTime() + dur * 60000),
    key: `${ev.id}@${ymd(s)}`,
  });
  const overlaps = (s: Date) => {
    const e = new Date(s.getTime() + Math.max(dur, 1) * 60000);
    return isBefore(s, to) && isAfter(e, from);
  };

  const r = ev.recurrence;
  if (!r) return overlaps(start0) ? [make(start0)] : [];

  const out: Occurrence[] = [];
  const until = r.until ? addDays(fromYmd(r.until), 1) : undefined;
  const skip = new Set(ev.exceptions ?? []);
  const interval = Math.max(1, r.interval || 1);
  let emitted = 0;

  const consider = (s: Date) => {
    if (isBefore(s, start0)) return true;
    if (until && !isBefore(s, until)) return false;
    if (r.count && emitted >= r.count) return false;
    emitted++;
    if (!skip.has(ymd(s)) && overlaps(s)) out.push(make(s));
    return !isAfter(s, to);
  };

  if (r.freq === "weekly" && r.byWeekday?.length) {
    const days = [...r.byWeekday].sort();
    let week = startOfWeek(start0, { weekStartsOn: 0 });
    for (let i = 0; i < MAX_ITER; i++) {
      for (const wd of days) {
        const d = addDays(week, wd);
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), start0.getHours(), start0.getMinutes());
        if (!consider(s)) return out;
      }
      week = addWeeks(week, interval);
    }
    return out;
  }

  const step = { daily: addDays, weekly: addWeeks, monthly: addMonths, yearly: addYears }[r.freq];
  for (let i = 0; i < MAX_ITER; i++) {
    const s = step(start0, i * interval);
    // addMonths clamps the 31st to month end; skip clamped dates so "31st monthly" behaves like calendars do.
    if ((r.freq === "monthly" || r.freq === "yearly") && s.getDate() !== start0.getDate()) continue;
    if (!consider(s)) return out;
  }
  return out;
}

export function occurrencesInRange(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  return events.flatMap((e) => occurrences(e, from, to)).sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function occurrencesOnDay(events: CalEvent[], day: Date) {
  const s = startOfDay(day);
  return occurrencesInRange(events, s, addDays(s, 1));
}

export function describeRecurrence(r?: CalEvent["recurrence"]) {
  if (!r) return "Does not repeat";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[r.freq];
  let s = r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`;
  if (r.freq === "weekly" && r.byWeekday?.length) s += ` on ${r.byWeekday.map((d) => names[d]).join(", ")}`;
  if (r.until) s += ` until ${r.until}`;
  if (r.count) s += `, ${r.count} times`;
  return s;
}

/** Shift a single occurrence start into the series' time while keeping its weekday; used by drag/move. */
export function withDate(ev: CalEvent, day: Date): Pick<CalEvent, "start" | "end"> {
  const s = fromYmd(ev.start);
  const e = fromYmd(ev.end);
  const ns = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes());
  return { start: localIso(ns), end: localIso(new Date(ns.getTime() + (e.getTime() - s.getTime()))) };
}

export const weekdayOf = (d: Date) => getDay(d);
