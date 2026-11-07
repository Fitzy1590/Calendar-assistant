import { addDays, areIntervalsOverlapping, differenceInMinutes, format, startOfDay } from "date-fns";
import type { CalEvent, Task } from "../types";
import { live, useStore } from "../store";
import { occurrencesInRange, type Occurrence } from "./recurrence";
import { fromYmd, ymd } from "./util";

/** Occurrences that overlap a proposed slot. Used by the event editor and the email import. */
export function conflictsFor(start: Date, end: Date, ignoreId?: string): Occurrence[] {
  const evs = live(useStore.getState().events).filter((e) => e.id !== ignoreId);
  return occurrencesInRange(evs, addDays(start, -1), addDays(end, 1)).filter(
    (o) => !o.event.allDay && areIntervalsOverlapping({ start, end }, { start: o.start, end: o.end }),
  );
}

export function conflictsForEvent(ev: Pick<CalEvent, "start" | "end" | "allDay" | "id">) {
  if (ev.allDay) return [];
  return conflictsFor(fromYmd(ev.start), fromYmd(ev.end), ev.id);
}

export interface PlanItem {
  task: Task;
  day: string;
  reason: string;
}

/**
 * "Plan my week": spread open tasks (undated, overdue, or bunched up) across the next 7 days.
 * Each day gets a load score = booked event minutes + already-assigned task estimates;
 * high-priority tasks are placed first, onto the lightest days, earliest first.
 */
export function planWeek(now = new Date()): PlanItem[] {
  const s = useStore.getState();
  const today = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const load = new Map(days.map((d) => [ymd(d), 0]));
  const occ = occurrencesInRange(live(s.events), today, addDays(today, 7));
  for (const o of occ) {
    const k = ymd(o.start);
    if (load.has(k)) load.set(k, load.get(k)! + (o.event.allDay ? 120 : differenceInMinutes(o.end, o.start)));
  }
  const tasks = live(s.tasks).filter((t) => !t.done && !t.ignored);
  const todayKey = ymd(today);
  for (const t of tasks) if (t.due && t.due >= todayKey && load.has(t.due)) load.set(t.due, load.get(t.due)! + (t.estimateMins ?? 30));

  const toPlace = tasks
    .filter((t) => !t.due || t.due < todayKey)
    .sort((a, b) => rank(b) - rank(a));
  const plan: PlanItem[] = [];
  for (const t of toPlace) {
    // weekends weigh a little heavier so chores don't all land on Saturday
    const best = [...load.entries()].sort((a, b) => weight(a) - weight(b) || a[0].localeCompare(b[0]))[0];
    const [day, mins] = best;
    load.set(day, mins + (t.estimateMins ?? 30));
    plan.push({
      task: t,
      day,
      reason: `${format(fromYmd(day), "EEEE")} has ${Math.round(mins / 60)}h booked${t.due && t.due < todayKey ? " · was overdue" : ""}`,
    });
  }
  return plan;
}
const rank = (t: Task) => ({ high: 3, med: 2, low: 1 })[t.priority] * 10 + (t.due ? 5 : 0);
const weight = ([day, mins]: [string, number]) => mins + ([0, 6].includes(fromYmd(day).getDay()) ? 60 : 0);
