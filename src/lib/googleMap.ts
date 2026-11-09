import type { CalEvent, Recurrence } from "../types";
import { fromYmd, localIso } from "./util";

/**
 * Pure conversions between this app's events and Google Calendar API events.
 * No store, no network: unit-tested in googleMap.test.ts.
 */

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "20261110" / "20261110T090000" / "20261110T090000Z" -> local yyyy-mm-dd. */
function exdateToYmd(v: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
  if (!m) return undefined;
  if (m[7]) return ymdOf(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])));
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Google's `recurrence` lines (RRULE + EXDATE) -> our recurrence and skipped dates. */
export function parseRecurrence(lines?: string[]): { recurrence?: Recurrence; exceptions: string[] } {
  const exceptions: string[] = [];
  for (const l of lines ?? []) {
    if (!l.startsWith("EXDATE")) continue;
    for (const v of l.slice(l.indexOf(":") + 1).split(",")) {
      const d = exdateToYmd(v);
      if (d) exceptions.push(d);
    }
  }
  const r = lines?.find((x) => x.startsWith("RRULE:"));
  if (!r) return { exceptions };
  const kv = Object.fromEntries(
    r
      .slice(6)
      .split(";")
      .map((p) => p.split("=")),
  );
  const freq = ({ DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" } as const)[kv.FREQ as "DAILY"];
  if (!freq) return { exceptions };
  return {
    exceptions,
    recurrence: {
      freq,
      interval: Number(kv.INTERVAL || 1),
      byWeekday: kv.BYDAY
        ? kv.BYDAY.split(",")
            .map((d: string) => DAYS.indexOf(d.slice(-2)))
            .filter((d: number) => d >= 0)
        : undefined,
      until: kv.UNTIL ? `${kv.UNTIL.slice(0, 4)}-${kv.UNTIL.slice(4, 6)}-${kv.UNTIL.slice(6, 8)}` : undefined,
      count: kv.COUNT ? Number(kv.COUNT) : undefined,
    },
  };
}

/** Our recurrence + skipped dates -> Google `recurrence` lines. */
export function toRecurrenceLines(e: Pick<CalEvent, "recurrence" | "exceptions" | "allDay" | "start">, tz: string): string[] | undefined {
  const r = e.recurrence;
  if (!r) return undefined;
  let s = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval}`;
  if (r.byWeekday?.length) s += `;BYDAY=${r.byWeekday.map((d) => DAYS[d]).join(",")}`;
  if (r.until) s += `;UNTIL=${r.until.replace(/-/g, "")}T235959Z`;
  if (r.count) s += `;COUNT=${r.count}`;
  const out = [s];
  const skipped = [...new Set(e.exceptions ?? [])].sort();
  if (skipped.length) {
    const compact = (d: string) => d.replace(/-/g, "");
    if (e.allDay) out.push(`EXDATE;VALUE=DATE:${skipped.map(compact).join(",")}`);
    else {
      const time = e.start.slice(11, 16).replace(":", "") + "00";
      out.push(`EXDATE;TZID=${tz}:${skipped.map((d) => `${compact(d)}T${time}`).join(",")}`);
    }
  }
  return out;
}

/** The series a changed or cancelled instance belongs to, and which date it replaces. */
export function instanceInfo(g: any): { masterId: string; date: string } | null {
  if (!g?.recurringEventId || !g.originalStartTime) return null;
  const o = g.originalStartTime;
  const date = o.date ?? (o.dateTime ? ymdOf(new Date(o.dateTime)) : "");
  return date ? { masterId: g.recurringEventId, date } : null;
}

/** Google event -> fields of our event. Null for cancelled / startless events. */
export function fromGoogle(g: any): Partial<CalEvent> | null {
  if (!g || g.status === "cancelled" || !g.start) return null;
  const allDay = !!g.start.date;
  const start = allDay ? fromYmd(g.start.date) : new Date(g.start.dateTime);
  const end = allDay ? fromYmd(g.end.date) : new Date(g.end.dateTime);
  const { recurrence, exceptions } = parseRecurrence(g.recurrence);
  return {
    title: g.summary || "(no title)",
    start: localIso(start),
    end: localIso(end),
    allDay,
    location: g.location,
    notes: g.description,
    recurrence,
    exceptions: recurrence && exceptions.length ? exceptions : undefined,
    googleId: g.id,
    googleEtag: g.etag,
    source: "google",
  };
}

/** Our event -> Google API body. `recurrence` is null (not undefined) so a PATCH can clear a series. */
export function toGoogle(e: CalEvent, tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return {
    summary: e.title,
    location: e.location,
    description: e.notes,
    start: e.allDay ? { date: e.start.slice(0, 10) } : { dateTime: fromYmd(e.start).toISOString(), timeZone: tz },
    end: e.allDay ? { date: e.end.slice(0, 10) } : { dateTime: fromYmd(e.end).toISOString(), timeZone: tz },
    recurrence: toRecurrenceLines(e, tz) ?? null,
  };
}

/** Is an automatic sync due? `lastMs` is the later of the last attempt and the last good sync. */
export function syncDue(everyMins: number, lastMs: number, now = Date.now()): boolean {
  return everyMins > 0 && now - lastMs >= everyMins * 60_000;
}
