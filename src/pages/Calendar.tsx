import {
  addDays, addMonths, addWeeks, addYears, differenceInMinutes, format, isSameDay, isSameMonth, startOfDay,
  startOfMonth, startOfWeek, startOfYear,
} from "date-fns";
import { calendarEvents, isBirthdayEvent } from "../lib/birthdays";
import { BirthdaySync } from "../components/BirthdaySync";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CalEvent, Task } from "../types";
import { live, useStore } from "../store";
import { occurrencesInRange, type Occurrence } from "../lib/recurrence";
import { useForecast, useNow } from "../lib/hooks";
import { cx, fmtTime, localIso, ymd } from "../lib/util";
import { skyOf } from "../lib/weather";
import { EventEditor } from "../components/EventEditor";
import { MiniCalendar } from "../components/MiniCalendar";
import { ICake, ILeft, IMail, IPlus, IRight, WeatherIcon } from "../components/Icons";
import { PageHead, Seg, Toggle } from "../components/ui";

type View = "day" | "week" | "month" | "year";
const HOUR_PX = 48;

export function Calendar() {
  const s = useStore();
  const cfg = s.settings.pages.calendar;
  const view = cfg.view;
  const setView = (v: View) => s.updateSettings((st) => void (st.pages.calendar.view = v));
  const [cursor, setCursor] = useState(new Date());
  const [jump, setJump] = useState(0); // bumping it re-scrolls the day/week grid to now
  const [edit, setEdit] = useState<{ ev: Partial<CalEvent>; occ?: string } | null>(null);
  const [custom, setCustom] = useState(false);
  const ws = s.settings.weekStartsOn;

  const step = (n: number) =>
    setCursor((c) => (view === "day" ? addDays(c, n) : view === "week" ? addWeeks(c, n) : view === "month" ? addMonths(c, n) : addYears(c, n)));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "t") setCursor(new Date());
      const map: Record<string, View> = { d: "day", w: "week", m: "month", y: "year" };
      if (map[e.key]) setView(map[e.key]);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const title =
    view === "day" ? format(cursor, "EEEE d MMMM yyyy")
    : view === "week" ? `${format(startOfWeek(cursor, { weekStartsOn: ws }), "d MMM")} – ${format(addDays(startOfWeek(cursor, { weekStartsOn: ws }), 6), "d MMM yyyy")}`
    : view === "month" ? format(cursor, "MMMM yyyy")
    : format(cursor, "yyyy");

  const newAt = (d: Date, allDay = false) =>
    setEdit({ ev: allDay ? { start: localIso(startOfDay(d)), end: localIso(addDays(startOfDay(d), 1)), allDay: true } : { start: localIso(d), end: localIso(new Date(d.getTime() + 3600e3)) } });
  const openOcc = (o: Occurrence) => {
    if (isBirthdayEvent(o.event)) return s.setPage("contacts"); // birthdays are edited on the contact
    setEdit({ ev: o.event, occ: ymd(o.start) });
  };
  const [bdays, setBdays] = useState(false);

  return (
    <>
      <PageHead
        title="Calendar"
        actions={<>
          <button className="btn" onClick={() => setBdays(true)} title="Check every birthday is on the calendar"><ICake size={16} /> Sync birthdays</button>
          <button className="btn" onClick={() => s.setUi({ emailImportOpen: true })}><IMail /> Scan email</button>
          <button className="btn primary" onClick={() => newAt(new Date(new Date().setMinutes(0, 0, 0) + 3600e3))}><IPlus /> New event</button>
        </>}
        open={custom}
        setOpen={setCustom}
        customise={
          <div className="row" style={{ gap: 24 }}>
            <span className="row"><Toggle checked={cfg.showTasks} onChange={(v) => s.updateSettings((st) => void (st.pages.calendar.showTasks = v))} label="Show tasks" /> Show tasks on the calendar</span>
            <span className="row"><Toggle checked={cfg.showBirthdays} onChange={(v) => s.updateSettings((st) => void (st.pages.calendar.showBirthdays = v))} label="Show birthdays" /> Show birthdays</span>
            <label className="row">Day starts at
              <select className="input" style={{ width: 90 }} value={cfg.dayStartHour} onChange={(e) => s.updateSettings((st) => void (st.pages.calendar.dayStartHour = +e.target.value))}>
                {Array.from({ length: 12 }, (_, h) => <option key={h} value={h}>{h}:00</option>)}
              </select>
            </label>
            <label className="row">Week starts
              <Seg value={String(ws)} onChange={(v) => s.updateSettings((st) => void (st.weekStartsOn = +v as 0 | 1))} options={[{ value: "1", label: "Mon" }, { value: "0", label: "Sun" }]} />
            </label>
          </div>
        }
      />
      <div className="cal-toolbar">
        <button className="btn" onClick={() => (setCursor(new Date()), setJump((n) => n + 1))}>Today</button>
        <button className="btn ghost icon" onClick={() => step(-1)} aria-label="Previous"><ILeft /></button>
        <button className="btn ghost icon" onClick={() => step(1)} aria-label="Next"><IRight /></button>
        <div className="cal-title">{title}</div>
        <span style={{ flex: 1 }} />
        <Seg value={view} onChange={setView} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }]} />
      </div>
      {view === "month" && <MonthView cursor={cursor} onNew={(d) => newAt(d, true)} onOpen={openOcc} />}
      {(view === "week" || view === "day") && <TimeGrid jump={jump} days={view === "day" ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, { weekStartsOn: ws }), i))} onNew={newAt} onOpen={openOcc} />}
      {view === "year" && (
        <div className="year">
          {Array.from({ length: 12 }, (_, m) => addMonths(startOfYear(cursor), m)).map((m) => (
            <div key={m.getMonth()}>
              <div className="mname" onClick={() => (setCursor(m), setView("month"))}>{format(m, "MMMM")}</div>
              <MiniCalendar key={m.toISOString()} month={m} hideNav heat onPick={(d) => s.selectDay(ymd(d))} selected={s.selectedDay} />
            </div>
          ))}
        </div>
      )}
      {edit && <EventEditor initial={edit.ev} occurrenceDate={edit.occ} onClose={() => setEdit(null)} />}
      {bdays && <BirthdaySync onClose={() => setBdays(false)} />}
    </>
  );
}

function useRange(from: Date, to: Date) {
  const events = useStore((s) => s.events);
  const tasks = useStore((s) => s.tasks);
  const contacts = useStore((s) => s.contacts);
  const showTasks = useStore((s) => s.settings.pages.calendar.showTasks);
  const showB = useStore((s) => s.settings.pages.calendar.showBirthdays);
  return useMemo(() => {
    const occ = occurrencesInRange(calendarEvents(useStore.getState()), from, to);
    const byDay = new Map<string, { occ: Occurrence[]; tasks: Task[] }>();
    const slot = (k: string) => byDay.get(k) ?? (byDay.set(k, { occ: [], tasks: [] }), byDay.get(k)!);
    for (const o of occ) {
      // multi-day events appear on each day they cover
      for (let d = startOfDay(o.start); d < o.end || isSameDay(d, o.start); d = addDays(d, 1)) {
        slot(ymd(d)).occ.push(o);
        if (!o.event.allDay && differenceInMinutes(o.end, o.start) < 24 * 60) break;
      }
    }
    if (showTasks) for (const t of live(tasks)) if (t.due) slot(t.due).tasks.push(t);
    return byDay;
  }, [events, tasks, contacts, showTasks, showB, from.getTime(), to.getTime()]);
}

function MonthView({ cursor, onNew, onOpen }: { cursor: Date; onNew: (d: Date) => void; onOpen: (o: Occurrence) => void }) {
  const s = useStore();
  const ws = s.settings.weekStartsOn;
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: ws });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const data = useRange(start, addDays(start, 42));
  const wx = useForecast();
  const wxBy = new Map((wx.data?.daily ?? []).map((d) => [d.date, d]));
  const toggleTask = (t: Task) => s.upsert("tasks", { id: t.id, done: !t.done, doneAt: Date.now() });
  return (
    <div className="month">
      {days.slice(0, 7).map((d) => <div key={d.getDay()} className="h">{format(d, "EEE")}</div>)}
      {days.map((d) => {
        const k = ymd(d);
        const cell = data.get(k);
        const w = wxBy.get(k);
        const items = [...(cell?.occ ?? [])];
        return (
          <div key={k} className={cx("cell", !isSameMonth(d, cursor) && "out", isSameDay(d, new Date()) && "today")}
            onClick={() => s.selectDay(k)} onDoubleClick={() => onNew(d)}>
            <div className="n">
              <b>{format(d, "d")}</b>
              {w && <span className="wxmini"><WeatherIcon sky={skyOf(w.code).sky} size={13} />{Math.round(w.max)}°</span>}
            </div>
            {items.slice(0, 3).map((o) => (
              <div key={o.key} className="pill" style={{ ["--c" as string]: o.event.color }} onClick={(e) => (e.stopPropagation(), onOpen(o))}>
                {!o.event.allDay && <span className="mono" style={{ fontSize: 10.5 }}>{fmtTime(o.start, s.settings.clock24)} </span>}{o.event.title}
              </div>
            ))}
            {(cell?.tasks ?? []).slice(0, Math.max(0, 4 - items.length)).map((t) => (
              <div key={t.id} className={cx("pill task", t.done && "done")} onClick={(e) => (e.stopPropagation(), toggleTask(t))} title="Click to toggle done">{t.title}</div>
            ))}
            {items.length + (cell?.tasks.length ?? 0) > 4 && <div className="faint" style={{ fontSize: 11 }}>+{items.length + (cell?.tasks.length ?? 0) - 4} more</div>}
          </div>
        );
      })}
    </div>
  );
}

function TimeGrid({ days, onNew, onOpen, jump }: { days: Date[]; onNew: (d: Date) => void; onOpen: (o: Occurrence) => void; jump: number }) {
  const s = useStore();
  const data = useRange(days[0], addDays(days[days.length - 1], 1));
  const scroller = useRef<HTMLDivElement>(null);
  const firstCol = useRef<HTMLDivElement>(null);
  const startHour = s.settings.pages.calendar.dayStartHour;
  useNow(60_000); // keeps the red "now" line moving

  // Like other calendars: open at the current time (a third of the way down) when today is shown;
  // otherwise at the first event of the period, or the "day starts at" hour. Only when the period
  // changes or Today is pressed, so it never fights your own scrolling.
  useLayoutEffect(() => {
    const el = scroller.current;
    const col = firstCol.current;
    if (!el || !col) return;
    const now = new Date();
    let hour: number;
    if (days.some((d) => isSameDay(d, now))) hour = now.getHours() + now.getMinutes() / 60;
    else {
      const starts = days.flatMap((d) => (data.get(ymd(d))?.occ ?? []).filter((o) => !o.event.allDay && isSameDay(o.start, d)).map((o) => o.start.getHours() + o.start.getMinutes() / 60));
      hour = starts.length ? Math.max(Math.min(...starts) - 0.5, 0) : startHour;
    }
    const visible = el.clientHeight - col.offsetTop; // height below the pinned day headers and all-day row
    const third = days.some((d) => isSameDay(d, now)) ? visible / 3 : 0;
    el.scrollTop = Math.max(0, hour * HOUR_PX - third);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0].getTime(), days.length, jump]);
  const now = new Date();
  const wx = useForecast();
  const wxBy = new Map((wx.data?.daily ?? []).map((d) => [d.date, d]));
  return (
    <div ref={scroller} className="timegrid" style={{ ["--days" as string]: days.length }}>
      <div className="corner" />
      {days.map((d) => {
        const w = wxBy.get(ymd(d));
        return (
          <div key={d.toISOString()} className={cx("colhead", isSameDay(d, now) && "today")} onClick={() => s.selectDay(ymd(d))}>
            <div className="dname">{format(d, "EEE")}</div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="dnum">{format(d, "d")}</span>
              {w && <span className="faint row mono" style={{ fontSize: 11, gap: 3 }}><WeatherIcon sky={skyOf(w.code).sky} size={14} />{Math.round(w.max)}°</span>}
            </div>
          </div>
        );
      })}
      <div className="hours faint allday-label" style={{ fontSize: 10, paddingTop: 6 }}>all day</div>
      {days.map((d) => {
        const cell = data.get(ymd(d));
        return (
          <div key={"ad" + d.toISOString()} className="allday" onDoubleClick={() => onNew(startOfDay(d))}>
            {cell?.occ.filter((o) => o.event.allDay).map((o) => <div key={o.key} className="pill" style={{ ["--c" as string]: o.event.color }} onClick={() => onOpen(o)}>{o.event.title}</div>)}
            {cell?.tasks.map((t) => <div key={t.id} className={cx("pill task", t.done && "done")} onClick={() => s.upsert("tasks", { id: t.id, done: !t.done, doneAt: Date.now() })}>{t.title}</div>)}
          </div>
        );
      })}
      <div className="hours">{Array.from({ length: 24 }, (_, h) => <div key={h}>{h === 0 ? "" : s.settings.clock24 ? `${h}:00` : format(new Date(2000, 0, 1, h), "h a")}</div>)}</div>
      {days.map((d, i) => {
        const timed = (data.get(ymd(d))?.occ ?? []).filter((o) => !o.event.allDay);
        const lanes = layout(timed);
        return (
          <div key={"c" + d.toISOString()} ref={i === 0 ? firstCol : undefined} className="col" style={{ height: 24 * HOUR_PX }}
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              const y = e.nativeEvent.offsetY;
              const mins = Math.floor((y / HOUR_PX) * 2) * 30;
              onNew(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins));
            }}>
            {isSameDay(d, now) && <div className="now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }} />}
            {timed.map((o) => {
              const s0 = isSameDay(o.start, d) ? o.start.getHours() * 60 + o.start.getMinutes() : 0;
              const dur = Math.max(differenceInMinutes(o.end, o.start), 20);
              const { lane, of } = lanes.get(o.key)!;
              return (
                <div key={o.key} className="ev" onClick={() => onOpen(o)}
                  style={{ top: (s0 / 60) * HOUR_PX, height: Math.min((dur / 60) * HOUR_PX, 24 * HOUR_PX - (s0 / 60) * HOUR_PX) - 2, left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 4px)`, right: "auto", ["--c" as string]: o.event.color }}>
                  <b>{o.event.title}</b>
                  <span className="mono" style={{ fontSize: 10.5 }}>{fmtTime(o.start, s.settings.clock24)}{o.event.location ? ` · ${o.event.location}` : ""}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Side-by-side lanes for overlapping events. */
function layout(occ: Occurrence[]) {
  const out = new Map<string, { lane: number; of: number }>();
  const sorted = [...occ].sort((a, b) => a.start.getTime() - b.start.getTime());
  let group: Occurrence[] = [];
  let groupEnd = 0;
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned = group.map((o) => {
      let lane = laneEnds.findIndex((e) => e <= o.start.getTime());
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = o.end.getTime();
      return [o, lane] as const;
    });
    for (const [o, lane] of assigned) out.set(o.key, { lane, of: laneEnds.length });
    group = [];
  };
  for (const o of sorted) {
    if (group.length && o.start.getTime() >= groupEnd) flush();
    group.push(o);
    groupEnd = Math.max(groupEnd, o.end.getTime());
  }
  if (group.length) flush();
  return out;
}
