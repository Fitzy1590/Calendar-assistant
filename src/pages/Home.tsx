import type React from "react";
import { calendarEvents } from "../lib/birthdays";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { useEffect, useState } from "react";
import type { HomeWidget } from "../types";
import { live, useStore } from "../store";
import { useAsync, useForecast, useNow } from "../lib/hooks";
import { getHeadlines } from "../lib/news";
import { occurrencesInRange } from "../lib/recurrence";
import { nextBirthday } from "../lib/reminders";
import { localEventsFor } from "../lib/localEvents";
import { kickoff, nextMatches } from "../lib/sports";
import { cx, fmtTime, fromYmd, todayYmd, ymd } from "../lib/util";
import { moveTo, nudge } from "../lib/order";
import { homeSummary } from "../lib/homeSummary";
import { unpaidBills, useMail } from "../lib/mail/engine";
import { skyOf, tempUnit } from "../lib/weather";
import { openUrl } from "../lib/platform";
import { MiniCalendar } from "../components/MiniCalendar";
import { ICake, IPin, WeatherIcon } from "../components/Icons";
import { PageHead, Toggle } from "../components/ui";
import { MailWidget } from "../components/mail/MailWidget";
import { STEP_NAMES } from "./Wizard";

const LABELS: Record<HomeWidget["id"], string> = {
  notes: "Pinned notes",
  weather: "Weather",
  clock: "Clock",
  minical: "Mini calendar",
  agenda: "Today & tomorrow",
  tasks: "Tasks due",
  localEvents: "Local events today",
  birthdays: "Birthdays",
  headlines: "Headlines",
  sports: "Your teams",
  mail: "Important email",
};

/** Sentence-case card heading with a count and a See all link. */
function CardTitle({ title, count, onAll, allLabel }: { title: string; count?: number; onAll?: () => void; allLabel?: string }) {
  return (
    <h2>
      <span>{title}</span>
      {count != null && <span className="count">{count}</span>}
      <span className="spacer" />
      {onAll && (
        <button className="card-link" onClick={onAll} aria-label={allLabel ?? `See all ${title.toLowerCase()}`}>
          See all →
        </button>
      )}
    </h2>
  );
}

export function Home() {
  const s = useStore();
  const [custom, setCustom] = useState(false);
  const [editing, setEditing] = useState(false); // rearranging: drag cards by their handle
  const [drag, setDrag] = useState<{ id: HomeWidget["id"]; over?: HomeWidget["id"] } | null>(null);
  const [said, setSaid] = useState("");
  const widgets = s.settings.pages.home.widgets;
  const messages = useMail((m) => m.messages);
  const today = todayYmd();
  const t0 = new Date(new Date().setHours(0, 0, 0, 0));
  const eventsToday = occurrencesInRange(calendarEvents(s), t0, addDays(t0, 1)).length;
  const tasksDue = live(s.tasks).filter((t) => !t.done && !t.ignored && t.due && t.due <= today).length;
  const bills = unpaidBills(messages);
  const dated = bills.filter((b) => b.dueDate).map((b) => differenceInCalendarDays(fromYmd(b.dueDate!), fromYmd(today)));
  const summary = homeSummary({
    events: eventsToday,
    tasks: tasksDue,
    bills: bills.length,
    billDays: dated.length ? Math.min(...dated) : undefined,
  });
  useEffect(() => {
    if (!editing) return () => {};
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setEditing(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);
  const now = useNow(30_000);
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const reorder = (next: typeof widgets) => s.updateSettings((st) => void (st.pages.home.widgets = next));
  const nudgeCard = (id: HomeWidget["id"], dir: -1 | 1) => {
    const next = nudge(widgets, id, dir, (x) => x.visible);
    if (next === widgets) return;
    reorder(next);
    const pos = next.filter((x) => x.visible).findIndex((x) => x.id === id) + 1;
    setSaid(`${LABELS[id]} moved to position ${pos} of ${next.filter((x) => x.visible).length}`);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-wid="${id}"] .grip-handle`)?.focus());
  };
  const grab = (e: React.PointerEvent<HTMLElement>, id: HomeWidget["id"]) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id });
  };
  const dragMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-wid]")?.dataset.wid as
      | HomeWidget["id"]
      | undefined;
    if (over !== drag.over) setDrag({ ...drag, over });
  };
  const dragEnd = () => {
    if (drag?.over && drag.over !== drag.id) reorder(moveTo(widgets, drag.id, drag.over));
    setDrag(null);
  };

  return (
    <>
      <PageHead
        title={`${greet}${s.settings.displayName ? ", " + s.settings.displayName : ""}`}
        sub={
          <>
            <div>{format(now, "EEEE d MMMM yyyy")}</div>
            <div className="home-summary">{summary}</div>
          </>
        }
        open={custom}
        setOpen={setCustom}
        customise={
          <div className="list">
            {widgets.map((w, i) => (
              <div key={w.id} className="row">
                <Toggle
                  checked={w.visible}
                  onChange={(v) => s.updateSettings((st) => void (st.pages.home.widgets[i].visible = v))}
                  label={LABELS[w.id]}
                />{" "}
                {LABELS[w.id]}
              </div>
            ))}
            <div>
              <button
                className="btn sm"
                onClick={() => {
                  setCustom(false);
                  setEditing(true);
                }}
              >
                Rearrange cards
              </button>
            </div>
          </div>
        }
      />
      {s.settings.setupSkipped.length > 0 && (
        <div className="card row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
          <span>
            <b>Finish setting up</b> <span className="muted">· {s.settings.setupSkipped.map((x) => STEP_NAMES[x]).join(", ")}</span>
          </span>
          <span className="row">
            <button className="btn primary sm" onClick={() => s.setUi({ wizardSteps: s.settings.setupSkipped })}>
              Continue setup
            </button>
            <button className="btn ghost sm" onClick={() => s.updateSettings((st) => void (st.setupSkipped = []))}>
              Dismiss
            </button>
          </span>
        </div>
      )}
      {editing && (
        <div className="card row edit-bar" style={{ marginBottom: 16, justifyContent: "space-between" }}>
          <span>Drag a card by its handle to move it, or focus a handle and press the arrow keys. Esc also finishes.</span>
          <button className="btn primary sm" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      )}
      <span className="visually-hidden" role="status">
        {said}
      </span>
      <div className={cx("home", editing && "editing")}>
        {widgets
          .filter((w) => w.visible && (w.id !== "mail" || s.settings.mail.alerts.homeCard))
          .map((w) => {
            const C = WIDGETS[w.id];
            return (
              <section
                key={w.id}
                data-wid={w.id}
                className={cx(
                  "card",
                  `w-${w.id}`,
                  drag?.id === w.id && "dragging",
                  drag?.over === w.id && drag.id !== w.id && "drop-target",
                )}
              >
                {editing && (
                  <button
                    className="grip-handle"
                    aria-label={`Move ${LABELS[w.id]}. Drag, or press the arrow keys.`}
                    onPointerDown={(e) => grab(e, w.id)}
                    onPointerMove={dragMove}
                    onPointerUp={dragEnd}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), nudgeCard(w.id, -1));
                      else if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), nudgeCard(w.id, 1));
                    }}
                  >
                    <span className="grip-dots" aria-hidden="true" />
                  </button>
                )}
                <C />
              </section>
            );
          })}
      </div>
    </>
  );
}

function WeatherWidget() {
  const s = useStore();
  const wx = useForecast();
  const loc = s.settings.location;
  if (!loc)
    return (
      <div className="empty">
        Set your suburb in Settings to see the weather.{" "}
        <button className="btn sm" onClick={() => s.setPage("settings")}>
          Set location
        </button>
      </div>
    );
  if (!wx.data) return <div className="empty">{wx.error ? `Weather unavailable: ${wx.error}` : "Loading weather…"}</div>;
  const { current, daily, hourly } = wx.data;
  const sky = skyOf(current.code);
  const today = daily[0];
  const nowIdx = hourly.findIndex((h) => new Date(h.time) >= new Date());
  const next = hourly.slice(Math.max(nowIdx, 0), Math.max(nowIdx, 0) + 24);
  const tmin = Math.min(...next.map((h) => h.temp));
  const tmax = Math.max(...next.map((h) => h.temp));
  const pts = next.map((h, i) => `${(i / 23) * 100},${30 - ((h.temp - tmin) / Math.max(tmax - tmin, 1)) * 26}`).join(" ");
  return (
    <>
      <div className="wx-hero">
        <div className="wx-temp">
          {Math.round(current.temp)}
          <sup>{tempUnit(s.settings.units)}</sup>
        </div>
        <div>
          <div className="row" style={{ gap: 8 }}>
            <WeatherIcon sky={sky.sky} night={!current.isDay} size={26} />
            <span style={{ fontSize: 18 }}>{sky.label}</span>
          </div>
          <div className="wx-place">
            <IPin size={16} /> {loc.name}
            {loc.city && loc.city !== loc.name ? (
              <span className="muted" style={{ fontWeight: 400 }}>
                , {loc.city}
              </span>
            ) : null}
          </div>
          <div className="wx-meta">
            <span>Feels {Math.round(current.feels)}°</span>
            <span>
              H {Math.round(today.max)}° · L {Math.round(today.min)}°
            </span>
            <span>Rain {today.rainChance}%</span>
            <span>UV {Math.round(today.uv)}</span>
            <span>Wind {Math.round(current.wind)}</span>
            <span>
              Sun {today.sunrise.slice(11)}–{today.sunset.slice(11)}
            </span>
          </div>
        </div>
      </div>
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        style={{ width: "100%", height: 40, marginTop: 14, color: "var(--accent)" }}
        aria-label="Temperature next 24 hours"
      >
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="row mono faint" style={{ justifyContent: "space-between", fontSize: 11 }}>
        {next
          .filter((_, i) => i % 4 === 0)
          .map((h) => (
            <span key={h.time}>
              {h.time.slice(11, 13)}h {Math.round(h.temp)}°
            </span>
          ))}
      </div>
      <div className="wx-strip">
        {daily.slice(0, 7).map((d) => (
          <button key={d.date} className="wx-day" aria-pressed={s.selectedDay === d.date} onClick={() => s.selectDay(d.date)}>
            <span className="d">{d.date === todayYmd() ? "Today" : format(new Date(d.date + "T00:00"), "EEE")}</span>
            <WeatherIcon sky={skyOf(d.code).sky} />
            <span className="t">
              {Math.round(d.max)}° <span className="faint">{Math.round(d.min)}°</span>
            </span>
            <span className="r">{d.rainChance >= 20 ? `${d.rainChance}%` : ""}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ClockWidget() {
  const now = useNow(1000);
  const clock24 = useStore((s) => s.settings.clock24);
  const [hm, ap] = format(now, clock24 ? "HH:mm" : "h:mm a").split(" ");
  return (
    <>
      <h2>Now</h2>
      <div className="clock">
        {hm}
        <small>{ap ?? format(now, "ss")}</small>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        {format(now, "EEEE d MMMM")} · week {format(now, "I")}
      </div>
      <div className="faint" style={{ fontSize: 12.5 }}>
        {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </div>
    </>
  );
}

function MiniCalWidget() {
  const s = useStore();
  return (
    <>
      <CardTitle title="Calendar" />
      <MiniCalendar selected={s.selectedDay} onPick={(d) => s.selectDay(ymd(d))} />
    </>
  );
}

function AgendaWidget() {
  const s = useStore();
  const t0 = new Date(new Date().setHours(0, 0, 0, 0));
  const occ = occurrencesInRange(calendarEvents(s), t0, addDays(t0, 2)).filter((o) => o.event.allDay || o.end > new Date());
  return (
    <>
      <CardTitle title="Today & tomorrow" count={occ.length} onAll={() => s.setPage("calendar")} allLabel="See all events in Calendar" />
      <div className="list">
        {occ.slice(0, 8).map((o) => (
          <div key={o.key} className="agenda-item" onClick={() => s.selectDay(ymd(o.start))} style={{ cursor: "pointer" }}>
            <span className="when">
              {ymd(o.start) !== todayYmd() ? "Tmrw " : ""}
              {o.event.allDay ? "all day" : fmtTime(o.start, s.settings.clock24)}
            </span>
            <span>
              <span className="what">{o.event.title}</span>
              {o.event.location && <div className="where">{o.event.location}</div>}
            </span>
          </div>
        ))}
        {!occ.length && <div className="empty">Nothing booked. Try "Lunch with Sam tomorrow at 1" in the bar above.</div>}
      </div>
    </>
  );
}

function TasksWidget() {
  const s = useStore();
  const today = todayYmd();
  const tasks = live(s.tasks)
    .filter((t) => !t.done && !t.ignored && (!t.due || t.due <= today))
    .sort((a, b) => (a.due ?? "z").localeCompare(b.due ?? "z"));
  return (
    <>
      <CardTitle title="Tasks" count={tasks.length} onAll={() => s.setPage("tasks")} allLabel="See all tasks" />
      <div className="list">
        {tasks.slice(0, 7).map((t) => (
          <div key={t.id} className="task-row">
            <button
              className="check"
              onClick={() => s.upsert("tasks", { id: t.id, done: true, doneAt: Date.now() })}
              aria-label={`Complete ${t.title}`}
            />
            <span>
              {t.title}{" "}
              {t.due && t.due < today && (
                <span className="tag" style={{ color: "var(--bad)" }}>
                  overdue
                </span>
              )}
            </span>
            <span className={"mono prio-" + t.priority} style={{ fontSize: 11 }}>
              {t.priority === "high" ? "!" : ""}
            </span>
          </div>
        ))}
        {!tasks.length && <div className="empty">All clear for today.</div>}
      </div>
    </>
  );
}

function BirthdaysWidget() {
  const s = useStore();
  const list = live(s.contacts)
    .filter((c) => c.birthday)
    .map((c) => ({ c, ...nextBirthday(c.birthday!) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);
  return (
    <>
      <CardTitle title="Birthdays" count={list.length} />
      <div className="list">
        {list.map(({ c, date, age }) => (
          <div key={c.id} className="row" style={{ justifyContent: "space-between" }}>
            <span className="row">
              <ICake size={16} /> {c.name}
              {age ? <span className="faint"> turns {age}</span> : null}
            </span>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {format(date, "d MMM")}
            </span>
          </div>
        ))}
        {!list.length && <div className="empty">Add birthdays to contacts to see them here.</div>}
      </div>
    </>
  );
}

function HeadlinesWidget() {
  const s = useStore();
  const topic = s.settings.newsCategories[0] ?? "TOP";
  const news = useAsync(() => getHeadlines(topic, s.settings.newsRegion), [topic, s.settings.newsRegion]);
  return (
    <>
      <CardTitle title="Headlines" onAll={() => s.setPage("news")} allLabel="See all headlines" />
      <div className="list">
        {(news.data ?? []).slice(0, 5).map((h) => (
          <a key={h.link} href={h.link} onClick={(e) => (e.preventDefault(), openUrl(h.link))} style={{ textDecoration: "none" }}>
            <div style={{ fontWeight: 500 }}>{h.title}</div>
            <div className="faint" style={{ fontSize: 12 }}>
              {h.source}
            </div>
          </a>
        ))}
        {news.error && <div className="empty">Headlines need the desktop/Android app or a sync server (browser CORS).</div>}
      </div>
    </>
  );
}

function SportsWidget() {
  const s = useStore();
  const teams = s.settings.teams;
  const data = useAsync(async () => {
    const all = await Promise.all(teams.map((t) => nextMatches(t.id, s.settings.sportsApiKey).catch(() => [])));
    return all
      .flat()
      .sort((a, b) => kickoff(a).getTime() - kickoff(b).getTime())
      .slice(0, 5);
  }, [teams.map((t) => t.id).join()]);
  return (
    <>
      <CardTitle title="Your teams" onAll={() => s.setPage("sports")} allLabel="See all fixtures" />
      <div className="list">
        {(data.data ?? []).map((m) => (
          <div key={m.id}>
            <div style={{ fontWeight: 500 }}>
              {m.home} v {m.away}
            </div>
            <div className="faint" style={{ fontSize: 12 }}>
              {format(kickoff(m), "EEE d MMM, h:mm a")} · {m.league}
            </div>
          </div>
        ))}
        {!teams.length && <div className="empty">Follow teams in Sports to see fixtures here.</div>}
      </div>
    </>
  );
}

function LocalEventsWidget() {
  const s = useStore();
  const loc = s.settings.location;
  const day = todayYmd();
  const data = useAsync(() => (loc ? localEventsFor(loc, day, s.settings.localEventsApiKey) : Promise.resolve([])), [loc?.lat, day]);
  return (
    <>
      <h2>On today near {loc?.name ?? "you"}</h2>
      <div className="list">
        {(data.data ?? []).slice(0, 5).map((e) => (
          <a key={e.id} href={e.url} onClick={(ev) => (ev.preventDefault(), openUrl(e.url))} style={{ textDecoration: "none" }}>
            <div style={{ fontWeight: 500 }}>{e.name}</div>
            <div className="faint" style={{ fontSize: 12 }}>
              {[e.start.slice(11, 16), e.venue].filter(Boolean).join(" · ")}
            </div>
          </a>
        ))}
        {!data.data?.length && (
          <div className="empty">
            Open any day to see local event searches
            {!s.settings.localEventsApiKey ? ", or add a Ticketmaster key in Settings for listings" : ""}.{" "}
            <button className="btn sm" onClick={() => s.selectDay(day)}>
              Today
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function NotesWidget() {
  const s = useStore();
  const notes = live(s.notes)
    .filter((n) => !n.archived)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.order - b.order)
    .slice(0, 4);
  return (
    <>
      <CardTitle
        title="Notes"
        count={live(s.notes).filter((n) => !n.archived).length}
        onAll={() => s.setPage("notes")}
        allLabel="See all notes"
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {notes.map((n) => (
          <div
            key={n.id}
            className="note"
            style={{ ["--nc" as string]: `var(--n-${n.color})`, minHeight: 70, padding: 10, transform: "none" }}
            onClick={() => s.setPage("notes")}
          >
            {n.title && <b style={{ fontSize: 13 }}>{n.title}</b>}
            <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap", maxHeight: 72, overflow: "hidden" }}>{n.body}</div>
          </div>
        ))}
      </div>
      {!notes.length && <div className="empty">Jot something on the Notes page or say “take a note…”.</div>}
    </>
  );
}

const WIDGETS: Record<HomeWidget["id"], () => React.JSX.Element> = {
  notes: NotesWidget,
  weather: WeatherWidget,
  clock: ClockWidget,
  minical: MiniCalWidget,
  agenda: AgendaWidget,
  tasks: TasksWidget,
  birthdays: BirthdaysWidget,
  mail: MailWidget,
  headlines: HeadlinesWidget,
  sports: SportsWidget,
  localEvents: LocalEventsWidget,
};
