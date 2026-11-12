import { addDays, startOfWeek } from "date-fns";
import type { Task } from "../types";
import { fromYmd, ymd } from "./util";

/** First day (yyyy-MM-dd) of the week that contains `today`. */
export function weekStartYmd(today: string, weekStartsOn: 0 | 1): string {
  return ymd(startOfWeek(fromYmd(today), { weekStartsOn }));
}

/** The day a task sits on in the week plan: the day you chose to work on it, else its deadline. */
export function workDay(t: Pick<Task, "due" | "plannedFor">): string | undefined {
  return t.plannedFor || t.due || undefined;
}

/** Open tasks with no day yet (neither planned nor due). */
export function isUnassigned(t: Pick<Task, "due" | "plannedFor" | "done" | "deleted">): boolean {
  return !t.done && !t.deleted && !workDay(t);
}

/**
 * Open tasks planned for a week that has now passed. When a new week starts their planned day is cleared (the
 * deadline stays), so they return to the unassigned or overdue list, ready to be given a day again.
 * Done and parked tasks are never touched.
 */
export function tasksToRelease(tasks: Task[], today: string, weekStartsOn: 0 | 1): Task[] {
  const start = weekStartYmd(today, weekStartsOn);
  return tasks.filter((t) => !t.deleted && !t.done && !t.ignored && t.plannedFor && t.plannedFor < start);
}

/** The next `n` days starting today, as yyyy-MM-dd. */
export function nextDays(today: string, n = 7): string[] {
  return Array.from({ length: n }, (_, i) => ymd(addDays(fromYmd(today), i)));
}
