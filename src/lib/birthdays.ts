import type { CalEvent, Contact } from "../types";
import { live, useStore } from "../store";

/**
 * Birthdays appear on the calendar straight from Contacts: each contact with a birthday becomes a
 * yearly all-day "virtual" event. Nothing is copied, so every future year is always filled in
 * (planning December in January just works), and editing a birthday in Contacts updates the calendar.
 */

export const BIRTHDAY_COLOR = "#8a3a55";
export const isBirthdayEvent = (e: Pick<CalEvent, "id">) => e.id.startsWith("bday:");
export const contactIdOf = (e: Pick<CalEvent, "id">) => e.id.slice(5);

export function birthdayEvent(c: Contact): CalEvent | null {
  if (!c.birthday || c.deleted) return null;
  const [y, m, d] = c.birthday.split("-");
  if (!m || !d) return null;
  // anchor the series at the birth year (or 2000 when unknown) so ages are right and no year is missed
  const year = +y > 1900 ? y : "2000";
  const start = `${year}-${m}-${d}T00:00`;
  const next = new Date(+year, +m - 1, +d + 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}T00:00`;
  return {
    id: `bday:${c.id}`,
    updatedAt: c.updatedAt,
    title: `${c.name}'s birthday`,
    start,
    end,
    allDay: true,
    color: BIRTHDAY_COLOR,
    recurrence: { freq: "yearly", interval: 1 },
    source: "manual",
  };
}

export function birthdayEvents(contacts = useStore.getState().contacts): CalEvent[] {
  return live(contacts).map(birthdayEvent).filter((e): e is CalEvent => !!e);
}

/** Age someone turns on a given occurrence, when their birth year is known. */
export function ageOn(e: CalEvent, on: Date) {
  const y = +e.start.slice(0, 4);
  return y > 1900 && y !== 2000 ? on.getFullYear() - y : undefined;
}

/** Calendar events plus birthdays (when shown). Use this wherever the calendar is drawn or searched. */
export function calendarEvents(state = useStore.getState()): CalEvent[] {
  const evs = live(state.events);
  return state.settings.pages.calendar.showBirthdays ? [...evs, ...birthdayEvents(state.contacts)] : evs;
}

export function birthdayStats() {
  const all = live(useStore.getState().contacts);
  return { withBirthday: all.filter((c) => c.birthday).length, without: all.filter((c) => !c.birthday) };
}
