import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { calendarEvents } from "../lib/birthdays";
import { useMemo, useState } from "react";
import { live, useStore } from "../store";
import { occurrencesInRange } from "../lib/recurrence";
import { cx, ymd } from "../lib/util";
import { ILeft, IRight } from "./Icons";

export function MiniCalendar({
  month: initial,
  onPick,
  selected,
  heat,
  hideNav,
}: {
  month?: Date;
  onPick?: (d: Date) => void;
  selected?: string | null;
  heat?: boolean;
  hideNav?: boolean;
}) {
  const [month, setMonth] = useState(startOfMonth(initial ?? new Date()));
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn);
  const events = useStore((s) => s.events);
  const contacts = useStore((s) => s.contacts);
  const showB = useStore((s) => s.settings.pages.calendar.showBirthdays);
  const tasks = useStore((s) => s.tasks);
  const start = startOfWeek(month, { weekStartsOn });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of occurrencesInRange(calendarEvents(useStore.getState()), start, addDays(start, 42)))
      m.set(ymd(o.start), (m.get(ymd(o.start)) ?? 0) + 1);
    for (const t of live(tasks)) if (t.due && !t.done) m.set(t.due, (m.get(t.due) ?? 0) + 1);
    return m;
  }, [events, tasks, contacts, showB, start.getTime()]);
  const today = new Date();
  const heads = Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEEEE"));
  return (
    <div>
      {!hideNav && (
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <button className="btn ghost icon sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
            <ILeft size={16} />
          </button>
          <b style={{ fontFamily: "var(--font-display)" }}>{format(month, "MMMM yyyy")}</b>
          <button className="btn ghost icon sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            <IRight size={16} />
          </button>
        </div>
      )}
      <div className="minical">
        {heads.map((h, i) => (
          <div key={i} className="h">
            {h}
          </div>
        ))}
        {days.map((d) => {
          const n = counts.get(ymd(d)) ?? 0;
          return (
            <button
              key={d.toISOString()}
              className={cx(
                !isSameMonth(d, month) && "out",
                isSameDay(d, today) && "today",
                selected === ymd(d) && "sel",
                !heat && n > 0 && "has",
                heat && n > 0 && `heat l${Math.min(n, 3)}`,
              )}
              onClick={() => onPick?.(d)}
              aria-label={format(d, "EEEE d MMMM") + (n ? `, ${n} items` : "")}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
