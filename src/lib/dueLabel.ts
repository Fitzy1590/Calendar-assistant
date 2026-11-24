import { differenceInCalendarDays, format } from "date-fns";
import { fromYmd } from "./util";

/** A due date in plain words: "today", "tomorrow", "2 days ago", "Fri", "12 Dec". `today` is "yyyy-MM-dd". */
export function dueLabel(due: string | undefined, today: string): string {
  if (!due) return "No date";
  const d = differenceInCalendarDays(fromYmd(due), fromYmd(today));
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d < -1) return `${-d} days ago`;
  if (d <= 6) return format(fromYmd(due), "EEE");
  return format(fromYmd(due), fromYmd(due).getFullYear() === fromYmd(today).getFullYear() ? "d MMM" : "d MMM yyyy");
}
