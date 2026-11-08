import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import type { Settings } from "../types";
import { live, useStore } from "../store";
import { occurrencesInRange } from "./recurrence";
import { fromYmd, todayYmd } from "./util";

export interface Reminder {
  key: string; // stable id used for dismiss/snooze
  kind: "event" | "birthday" | "task";
  title: string;
  detail: string;
  at: Date; // when to alert
  refId: string;
}

export function nextBirthday(bday: string, from = new Date()) {
  const b = fromYmd(bday);
  let d = new Date(from.getFullYear(), b.getMonth(), b.getDate());
  if (d < startOfDay(from)) d = new Date(from.getFullYear() + 1, b.getMonth(), b.getDate());
  const age = b.getFullYear() > 1900 ? d.getFullYear() - b.getFullYear() : undefined;
  return { date: d, age };
}

/** Every reminder in the next `days`, filtered by the user's on/off switches, dismissals and snoozes. */
export function upcomingReminders(days = 14, now = new Date()): Reminder[] {
  const s = useStore.getState();
  const cfg: Settings["reminders"] = s.settings.reminders;
  const out: Reminder[] = [];

  if (cfg.events) {
    for (const o of occurrencesInRange(live(s.events), now, addDays(now, days))) {
      for (const mins of o.event.reminderMins ?? []) {
        out.push({
          key: `${o.key}:${mins}`,
          kind: "event",
          title: o.event.title,
          detail: `${format(o.start, "EEE d MMM")}${o.event.allDay ? "" : " · " + format(o.start, s.settings.clock24 ? "HH:mm" : "h:mm a")}${o.event.location ? " · " + o.event.location : ""}`,
          at: new Date(o.start.getTime() - mins * 60e3),
          refId: o.event.id,
        });
      }
    }
  }
  if (cfg.birthdays) {
    for (const c of live(s.contacts)) {
      if (!c.birthday) continue;
      const { date, age } = nextBirthday(c.birthday, now);
      const until = differenceInCalendarDays(date, now);
      if (until > Math.max(days, cfg.birthdayDaysBefore)) continue;
      out.push({
        key: `bday:${c.id}:${date.getFullYear()}`,
        kind: "birthday",
        title: `${c.name}'s birthday${age ? ` (${age})` : ""}`,
        detail: until === 0 ? "Today" : until === 1 ? "Tomorrow" : `${format(date, "EEE d MMM")} · in ${until} days`,
        at: new Date(addDays(date, -cfg.birthdayDaysBefore).setHours(9, 0, 0, 0)),
        refId: c.id,
      });
    }
  }
  if (cfg.tasks) {
    const today = todayYmd();
    for (const t of live(s.tasks)) {
      if (t.done || t.ignored || !t.due || t.due > format(addDays(now, days), "yyyy-MM-dd")) continue;
      const at = t.time ? fromYmd(`${t.due}T${t.time}`) : new Date(fromYmd(t.due).setHours(8, 0, 0, 0));
      out.push({
        key: `task:${t.id}:${t.due}`,
        kind: "task",
        title: t.title,
        detail: t.due < today ? `Overdue since ${format(fromYmd(t.due), "EEE d MMM")}` : `Due ${format(fromYmd(t.due), "EEE d MMM")}`,
        at,
        refId: t.id,
      });
    }
  }
  return out
    .filter((r) => !s.dismissedReminders[r.key] && !(s.snoozedReminders[r.key] > now.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Fire OS notifications for reminders that just came due. Runs on an interval from App. */
const fired = new Set<string>();
export function dueNow(now = new Date()) {
  const snoozed = useStore.getState().snoozedReminders;
  return upcomingReminders(14, now).filter((r) => {
    const due = Math.max(r.at.getTime(), snoozed[r.key] ?? 0);
    if (due > now.getTime() || now.getTime() - due > 6 * 3600e3 || fired.has(r.key)) return false;
    fired.add(r.key);
    return true;
  });
}
