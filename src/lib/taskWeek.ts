import { addDays, startOfWeek } from "date-fns";
import type { Task } from "../types";
import { fromYmd, ymd } from "./util";

/** First day (yyyy-MM-dd) of the week that contains `today`. */
export function weekStartYmd(today: string, weekStartsOn: 0 | 1): string {
  return ymd(startOfWeek(fromYmd(today), { weekStartsOn }));
}

/** Open tasks with no day yet. */
export function isUnassigned(t: Pick<Task, "due" | "done" | "deleted">): boolean {
  return !t.done && !t.deleted && !t.due;
}

/**
 * Open tasks planned for an earlier week. When a new week starts they go back to the unassigned list
 * (their day is cleared), ready to be given a day again. Done and parked tasks are never touched.
 */
export function tasksToRelease(tasks: Task[], today: string, weekStartsOn: 0 | 1): Task[] {
  const start = weekStartYmd(today, weekStartsOn);
  return tasks.filter((t) => !t.deleted && !t.done && !t.ignored && t.due && t.due < start);
}

/** The next `n` days starting today, as yyyy-MM-dd with a label. */
export function nextDays(today: string, n = 7): string[] {
  return Array.from({ length: n }, (_, i) => ymd(addDays(fromYmd(today), i)));
}
