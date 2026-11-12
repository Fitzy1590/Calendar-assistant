import { addDays, addMinutes, format, startOfDay } from "date-fns";
import { calendarEvents } from "./birthdays";
import type { CalEvent, PageId, Priority, Recurrence, ThemeName } from "../types";
import { findContact, live, useStore } from "../store";
import { conflictsForEvent, planWeek } from "./planner";
import { occurrencesInRange } from "./recurrence";
import { fromYmd, localIso, todayYmd, ymd } from "./util";
import { describeDay, getForecast } from "./weather";
import { placeCall, sendSms } from "./phone";
import * as notesLib from "./notes";
import * as shopLib from "./shopping";
import * as invitesLib from "./invites";

/**
 * The one command surface every input path uses: buttons, the local intent parser and Claude tool calls.
 * Each action returns a plain-English reply so the chat can show (and optionally speak) it.
 */

export interface ActionResult {
  text: string;
  items?: string[];
}

const st = () => useStore.getState();
const t = (d: Date) => format(d, st().settings.clock24 ? "HH:mm" : "h:mm a");

export function addEvent(a: {
  title: string;
  date: string; // yyyy-mm-dd
  time?: string; // HH:mm
  durationMins?: number;
  allDay?: boolean;
  location?: string;
  notes?: string;
  recurrence?: Recurrence;
}): ActionResult {
  const allDay = a.allDay ?? !a.time;
  const start = allDay ? fromYmd(a.date) : fromYmd(`${a.date}T${a.time}`);
  const end = allDay ? addDays(start, 1) : addMinutes(start, a.durationMins ?? 60);
  const draft: Partial<CalEvent> = {
    title: a.title,
    start: localIso(start),
    end: localIso(end),
    allDay,
    location: a.location,
    notes: a.notes,
    recurrence: a.recurrence,
    reminderMins: [st().settings.reminders.defaultEventMins],
    source: "assistant",
  };
  const ev = st().upsert("events", draft);
  const clashes = conflictsForEvent(ev);
  let text = `Added "${ev.title}" on ${format(start, "EEEE d MMMM")}${allDay ? "" : ` at ${t(start)}`}`;
  if (a.recurrence) text += `, repeating ${a.recurrence.freq}`;
  text += ".";
  if (clashes.length) text += ` Heads up: it overlaps ${clashes.map((c) => `"${c.event.title}"`).join(", ")}.`;
  return { text };
}

export function addTask(a: { title: string; due?: string; time?: string; priority?: Priority; notes?: string }): ActionResult {
  const task = st().upsert("tasks", {
    title: a.title,
    due: a.due,
    time: a.time,
    priority: a.priority ?? "med",
    done: false,
    notes: a.notes,
  });
  return { text: `Added task "${task.title}"${task.due ? ` for ${format(fromYmd(task.due), "EEEE d MMM")}` : ""}.` };
}

function matchTasks(q: string) {
  const s = q.toLowerCase();
  return live(st().tasks).filter((x) => x.title.toLowerCase().includes(s));
}

export function completeTask(q: string): ActionResult {
  const m = matchTasks(q).filter((x) => !x.done);
  if (!m.length) return { text: `I couldn't find an open task matching "${q}".` };
  st().upsert("tasks", { id: m[0].id, done: true, doneAt: Date.now() });
  return { text: `Marked "${m[0].title}" as done.` };
}

export function moveTask(q: string, date: string): ActionResult {
  const m = matchTasks(q).filter((x) => !x.done);
  if (!m.length) return { text: `I couldn't find an open task matching "${q}".` };
  st().upsert("tasks", { id: m[0].id, due: date, ignored: false });
  return { text: `Moved "${m[0].title}" to ${format(fromYmd(date), "EEEE d MMM")}.` };
}

export function deleteEvent(q: string, date?: string): ActionResult {
  const s = q.toLowerCase();
  const evs = live(st().events).filter((e) => e.title.toLowerCase().includes(s));
  if (!evs.length) return { text: `No event matching "${q}".` };
  const ev = evs[0];
  if (ev.recurrence && date) {
    st().upsert("events", { id: ev.id, exceptions: [...(ev.exceptions ?? []), date] });
    return { text: `Removed "${ev.title}" on ${format(fromYmd(date), "EEE d MMM")} only.` };
  }
  st().remove("events", ev.id);
  return { text: `Deleted "${ev.title}".` };
}

export function agenda(from: Date, to: Date, query?: string): ActionResult {
  const s = st();
  let occ = occurrencesInRange(calendarEvents(s), from, to);
  if (query)
    occ = occ.filter((o) =>
      (o.event.title + " " + (o.event.location ?? "") + " " + (o.event.notes ?? "")).toLowerCase().includes(query.toLowerCase()),
    );
  const fromK = ymd(from);
  const toK = ymd(addDays(to, -1));
  const tasks = query ? [] : live(s.tasks).filter((x) => !x.done && x.due && x.due >= fromK && x.due <= toK);
  const items = [
    ...occ.map(
      (o) =>
        `${format(o.start, "EEE d MMM")}${o.event.allDay ? "" : " " + t(o.start)} — ${o.event.title}${o.event.location ? ` (${o.event.location})` : ""}`,
    ),
    ...tasks.map((x) => `${format(fromYmd(x.due!), "EEE d MMM")} — task: ${x.title}`),
  ];
  const span = differenceLabel(from, to);
  if (!items.length) return { text: query ? `Nothing matching "${query}" ${span}.` : `You're free ${span}.` };
  return { text: `${items.length} item${items.length > 1 ? "s" : ""} ${span}:`, items };
}

export function searchEvents(query: string): ActionResult {
  const now = startOfDay(new Date());
  return agenda(addDays(now, -365), addDays(now, 365), query);
}

function differenceLabel(from: Date, to: Date) {
  const days = Math.round((to.getTime() - from.getTime()) / 864e5);
  if (days <= 1) return ymd(from) === todayYmd() ? "today" : `on ${format(from, "EEEE d MMM")}`;
  return `between ${format(from, "d MMM")} and ${format(addDays(to, -1), "d MMM")}`;
}

export async function weatherFor(date?: string): Promise<ActionResult> {
  const s = st().settings;
  if (!s.location) return { text: "Set your location in Settings first so I know where to check." };
  const f = await getForecast(s.location, s.units);
  const key = date ?? todayYmd();
  const d = f.daily.find((x) => x.date === key);
  if (!d) return { text: "I only have a 16-day forecast, so that day is out of range." };
  const when = key === todayYmd() ? "Today" : format(fromYmd(key), "EEEE");
  let text = `${when} in ${s.location.name}: ${describeDay(d, s.units)}.`;
  if (key === todayYmd()) text += ` It's ${Math.round(f.current.temp)}° now.`;
  return { text };
}

export async function call(name: string): Promise<ActionResult> {
  return { text: await placeCall(name) };
}
export async function sms(name: string, body?: string): Promise<ActionResult> {
  return { text: await sendSms(name, body) };
}

export function addContact(a: { name: string; phone?: string; email?: string; birthday?: string }): ActionResult {
  const existing = findContact(a.name);
  if (existing && existing.name.toLowerCase() === a.name.toLowerCase()) {
    st().upsert("contacts", { id: existing.id, ...a });
    return { text: `Updated ${a.name}.` };
  }
  st().upsert("contacts", a);
  return { text: `Added ${a.name} to contacts${a.birthday ? " with their birthday" : ""}.` };
}

const PAGE_WORDS: Record<string, PageId> = {
  home: "home",
  dashboard: "home",
  calendar: "calendar",
  diary: "calendar",
  tasks: "tasks",
  todo: "tasks",
  "to-do": "tasks",
  contacts: "contacts",
  people: "contacts",
  birthdays: "contacts",
  reminders: "reminders",
  news: "news",
  headlines: "news",
  sport: "sports",
  sports: "sports",
  settings: "settings",
  preferences: "settings",
  notes: "notes",
  note: "notes",
  "sticky notes": "notes",
  shopping: "shopping",
  "shopping list": "shopping",
  shop: "shopping",
};
export function navigate(word: string): ActionResult {
  const page = PAGE_WORDS[word.toLowerCase()] ?? (word as PageId);
  if (!Object.values(PAGE_WORDS).includes(page)) return { text: `I don't know a page called "${word}".` };
  st().setPage(page);
  return { text: `Opened ${page}.` };
}

export function setCalendarView(view: "day" | "week" | "month" | "year"): ActionResult {
  st().updateSettings((s) => void (s.pages.calendar.view = view));
  st().setPage("calendar");
  return { text: `Showing the ${view} view.` };
}

export function setTheme(theme: ThemeName): ActionResult {
  st().updateSettings((s) => void (s.theme = theme));
  return { text: `Switched to the ${theme} theme.` };
}

export function showDay(date: string): ActionResult {
  st().selectDay(date);
  return { text: `Here's ${format(fromYmd(date), "EEEE d MMMM")}.` };
}

export function planMyWeek(apply: boolean): ActionResult {
  const plan = planWeek();
  if (!plan.length) return { text: "Nothing to plan: every open task already has a day." };
  if (apply) for (const p of plan) st().upsert("tasks", { id: p.task.id, plannedFor: p.day });
  return {
    text: apply ? `Scheduled ${plan.length} task${plan.length > 1 ? "s" : ""} across the week:` : "Here's a suggested plan:",
    items: plan.map((p) => `${format(fromYmd(p.day), "EEE")} — ${p.task.title} (${p.reason})`),
  };
}

export function openNews(query?: string): ActionResult {
  st().setPage("news");
  if (query) window.dispatchEvent(new CustomEvent("news-search", { detail: query }));
  return { text: query ? `Searching news for "${query}".` : "Here are today's headlines." };
}

export function openSettings(query: string): ActionResult {
  st().setPage("settings");
  window.dispatchEvent(new CustomEvent("settings-search", { detail: query }));
  return { text: `Searching settings for "${query}".` };
}

export function takeNote(text: string, title?: string): ActionResult {
  const { addNote } = notesLib;
  const body = text.trim();
  if (!body) return { text: "What should the note say?" };
  addNote({ title: title ?? "", body: body.charAt(0).toUpperCase() + body.slice(1) });
  return { text: `Saved a note: "${body.length > 60 ? body.slice(0, 57) + "…" : body}".` };
}

export function findNotes(q: string): ActionResult {
  const hits = notesLib.searchNotes(q);
  st().setPage("notes");
  window.dispatchEvent(new CustomEvent("notes-search", { detail: q }));
  if (!hits.length) return { text: `No notes mention "${q}".` };
  return {
    text: `${hits.length} note${hits.length > 1 ? "s" : ""} about "${q}":`,
    items: hits.slice(0, 6).map((n) => n.title || n.body.split("\n")[0].slice(0, 80)),
  };
}

/* ---- shopping ---- */

export function shopFor(product: string): ActionResult {
  const q = product.replace(/^(some|a|an|the)\s+/i, "").trim();
  st().setPage("shopping");
  if (typeof window !== "undefined") setTimeout(() => window.dispatchEvent(new CustomEvent("shopping-search", { detail: q })), 0);
  return { text: `Looking for ${q} near you and comparing prices.` };
}

export function addShopping(names: string): ActionResult {
  const list = names
    .split(/,|\band\b/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const name of list) shopLib.addToList({ name: name.charAt(0).toUpperCase() + name.slice(1) });
  return { text: `Added ${list.join(", ")} to your shopping list.` };
}

export function listShopping(): ActionResult {
  const items = live(st().shopping).filter((i) => !i.done);
  if (!items.length) return { text: "Your shopping list is empty." };
  return {
    text: `${items.length} thing${items.length > 1 ? "s" : ""} on your shopping list:`,
    items: items.map((i) => i.name + (i.store?.name ? ` (${i.store.name})` : "")),
  };
}

/* ---- invites ---- */

export async function invite(
  people: string[],
  ev: { title: string; date: string; time?: string; durationMins?: number; location?: string },
): Promise<ActionResult> {
  const r = addEvent(ev);
  const created = Object.values(st().events).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const attendees = people.map((p) => invitesLib.attendeeFromText(p));
  st().upsert("events", {
    id: created.id,
    attendees,
    host: st().settings.displayName || undefined,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  } as Partial<CalEvent>);
  const missing = attendees.filter((a) => !a.phone && !a.email).map((a) => a.name);
  const sent: string[] = [];
  if (st().settings.invites.channel !== "ask") {
    for (const a of attendees.filter((x) => x.phone || x.email)) {
      await invitesLib.sendInvite(created.id, a.id, invitesLib.defaultChannel(a));
      sent.push(a.name);
    }
  }
  let text = r.text.replace(/\.$/, "") + ` with ${attendees.map((a) => a.name).join(", ")}.`;
  if (sent.length) text += ` Invites are ready to send to ${sent.join(", ")}.`;
  else text += " Open the event to send the invites by text or email.";
  if (missing.length) text += ` I don't have a number or email for ${missing.join(", ")}.`;
  return { text };
}
