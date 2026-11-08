import { addDays, addHours, format } from "date-fns";
import { useMemo, useState } from "react";
import type { CalEvent, Freq } from "../types";
import { toast, useStore } from "../store";
import { describeRecurrence } from "../lib/recurrence";
import { conflictsForEvent } from "../lib/planner";
import { fromYmd, localIso } from "../lib/util";
import { Field, Modal, Toggle } from "./ui";
import { InvitePanel } from "./InvitePanel";
import { openUrl } from "../lib/platform";
import { navigateUrl } from "../lib/shopping";

const COLORS = ["", "#2f5d8a", "#4f6b3a", "#b8860b", "#8a3a55", "#50606e"];

export function EventEditor({ initial, onClose, occurrenceDate }: { initial: Partial<CalEvent>; onClose: () => void; occurrenceDate?: string }) {
  const s = useStore();
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const [ev, setEv] = useState<Partial<CalEvent>>({
    title: "",
    start: localIso(addHours(now, 1)),
    end: localIso(addHours(now, 2)),
    allDay: false,
    reminderMins: [s.settings.reminders.defaultEventMins],
    ...initial,
  });
  const set = (p: Partial<CalEvent>) => setEv((e) => ({ ...e, ...p }));
  const conflicts = useMemo(() => (ev.start && ev.end ? conflictsForEvent(ev as CalEvent) : []), [ev.start, ev.end, ev.allDay]);
  const r = ev.recurrence;
  const startDate = fromYmd(ev.start!);

  /** Save without closing; keeps guests' latest replies (they can arrive while this is open). */
  const persist = (): CalEvent | null => {
    if (!ev.title?.trim()) {
      toast("Give it a title first");
      return null;
    }
    const stored = ev.id ? s.events[ev.id] : undefined;
    const attendees = ev.attendees?.map((a) => {
      const cur = stored?.attendees?.find((x) => x.id === a.id);
      return cur ? { ...a, status: cur.status, note: cur.note, respondedAt: cur.respondedAt, sentAt: cur.sentAt ?? a.sentAt, sentVia: cur.sentVia ?? a.sentVia } : a;
    });
    const guests = attendees?.length ? { host: s.settings.displayName || undefined, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } : {};
    const saved = s.upsert("events", { ...ev, ...guests, attendees, source: ev.source ?? "manual" } as CalEvent);
    setEv(saved);
    return saved;
  };
  const save = () => {
    const wasNew = !ev.id;
    if (!persist()) return;
    toast(wasNew ? "Event added" : "Event updated");
    onClose();
  };
  const del = (scope: "one" | "all") => {
    if (!ev.id) return onClose();
    if (scope === "one" && occurrenceDate) s.upsert("events", { id: ev.id, exceptions: [...(ev.exceptions ?? []), occurrenceDate] });
    else s.remove("events", ev.id);
    onClose();
  };

  return (
    <Modal
      title={ev.id ? "Edit event" : "New event"}
      onClose={onClose}
      footer={
        <>
          {ev.id && r && occurrenceDate && <button className="btn danger" onClick={() => del("one")}>Delete this one</button>}
          {ev.id && <button className="btn danger" onClick={() => del("all")}>{r ? "Delete series" : "Delete"}</button>}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </>
      }
    >
      <input className="input" autoFocus placeholder="Title" value={ev.title} onChange={(e) => set({ title: e.target.value })} style={{ fontSize: 17 }} />
      <div className="row"><Toggle checked={!!ev.allDay} onChange={(allDay) => set({ allDay })} label="All day" /> All day</div>
      <div className="grid2">
        <Field label="Starts">
          <input className="input" type={ev.allDay ? "date" : "datetime-local"} value={ev.allDay ? ev.start!.slice(0, 10) : ev.start}
            onChange={(e) => {
              const v = ev.allDay ? e.target.value + "T00:00" : e.target.value;
              const dur = fromYmd(ev.end!).getTime() - fromYmd(ev.start!).getTime();
              set({ start: v, end: localIso(new Date(fromYmd(v).getTime() + Math.max(dur, 0))) });
            }} />
        </Field>
        <Field label="Ends">
          <input className="input" type={ev.allDay ? "date" : "datetime-local"} value={ev.allDay ? localIso(addDays(fromYmd(ev.end!), -1)).slice(0, 10) : ev.end}
            onChange={(e) => set({ end: ev.allDay ? localIso(addDays(fromYmd(e.target.value), 1)) : e.target.value })} />
        </Field>
      </div>
      {conflicts.length > 0 && (
        <div className="alert">Overlaps {conflicts.map((c) => `"${c.event.title}" (${format(c.start, "h:mm a")})`).join(", ")}</div>
      )}
      <div className="grid2">
        <Field label="Repeats">
          <select className="input" value={r?.freq ?? ""} onChange={(e) => set({ recurrence: e.target.value ? { freq: e.target.value as Freq, interval: r?.interval ?? 1, byWeekday: e.target.value === "weekly" ? [startDate.getDay()] : undefined } : undefined })}>
            <option value="">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
        {r && (
          <Field label="Every">
            <input className="input" type="number" min={1} value={r.interval} onChange={(e) => set({ recurrence: { ...r, interval: Math.max(1, +e.target.value) } })} />
          </Field>
        )}
      </div>
      {r?.freq === "weekly" && (
        <div className="row">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <button key={i} className="chip" aria-pressed={r.byWeekday?.includes(i)} onClick={() => {
              const cur = new Set(r.byWeekday ?? []);
              cur.has(i) ? cur.delete(i) : cur.add(i);
              set({ recurrence: { ...r, byWeekday: [...cur].sort() } });
            }}>{d}</button>
          ))}
        </div>
      )}
      {r && (
        <div className="grid2">
          <Field label="Until (optional)"><input className="input" type="date" value={r.until ?? ""} onChange={(e) => set({ recurrence: { ...r, until: e.target.value || undefined } })} /></Field>
          <Field label="Summary"><div className="muted" style={{ paddingTop: 8 }}>{describeRecurrence(r)}</div></Field>
        </div>
      )}
      <Field label="Location">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" value={ev.location ?? ""} onChange={(e) => set({ location: e.target.value })} placeholder="Address or place name" />
          {ev.location && <button type="button" className="btn sm" onClick={() => openUrl(navigateUrl({ name: ev.location }))} title="Directions in Google Maps">Maps</button>}
        </div>
      </Field>
      <div className="grid2">
        <Field label="Reminder">
          <select className="input" value={ev.reminderMins?.[0] ?? -1} onChange={(e) => set({ reminderMins: +e.target.value < 0 ? [] : [+e.target.value] })}>
            <option value={-1}>None</option>
            {[0, 5, 10, 15, 30, 60, 120, 1440, 2880].map((m) => <option key={m} value={m}>{m === 0 ? "At start" : m < 60 ? `${m} min before` : m < 1440 ? `${m / 60} h before` : `${m / 1440} day before`}</option>)}
          </select>
        </Field>
        <Field label="Colour">
          <div className="row">{COLORS.map((c) => <button key={c} className="accent-dot" style={{ background: c || "var(--accent)", width: 22, height: 22 }} aria-pressed={(ev.color ?? "") === c} onClick={() => set({ color: c || undefined })} aria-label={c || "default"} />)}</div>
        </Field>
      </div>
      <Field label="Notes"><textarea className="input" rows={3} value={ev.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="hr" />
      <InvitePanel ev={ev} set={set} persist={persist} />
    </Modal>
  );
}
