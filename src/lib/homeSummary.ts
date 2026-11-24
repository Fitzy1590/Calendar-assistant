/** The one-line summary under the Home greeting, e.g. "3 events today · 3 tasks due · 1 bill due in 9 days". */
export interface DaySummary {
  events: number; // events on today's calendar
  tasks: number; // open tasks due today or earlier
  bills: number; // unpaid bills
  billDays?: number; // days until the earliest unpaid bill is due (negative = overdue); undefined when no date is known
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const inDays = (d: number) => (d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

export function homeSummary(d: DaySummary): string {
  const parts: string[] = [];
  if (d.events > 0) parts.push(`${plural(d.events, "event")} today`);
  if (d.tasks > 0) parts.push(`${plural(d.tasks, "task")} due`);
  if (d.bills > 0) {
    if (d.billDays === undefined) parts.push(`${plural(d.bills, "bill")} to pay`);
    else if (d.billDays < 0) parts.push(`${plural(d.bills, "bill")} overdue`);
    else if (d.bills === 1) parts.push(`1 bill due ${inDays(d.billDays)}`);
    else parts.push(`${d.bills} bills due, first ${inDays(d.billDays)}`);
  }
  return parts.length ? parts.join(" · ") : "Nothing on today.";
}
