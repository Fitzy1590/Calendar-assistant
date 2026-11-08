import { addDays, format } from "date-fns";
import { calendarEvents, isBirthdayEvent } from "../lib/birthdays";
import { useState } from "react";
import { live, useStore } from "../store";
import { useAsync, useForecast } from "../lib/hooks";
import { localEventsFor, localSearchLinks } from "../lib/localEvents";
import { occurrencesOnDay } from "../lib/recurrence";
import { fromYmd, fmtTime, localIso } from "../lib/util";
import { skyOf, tempUnit } from "../lib/weather";
import { openUrl } from "../lib/platform";
import { EventEditor } from "./EventEditor";
import { IExternal, ILeft, IPlus, IRight, IX, WeatherIcon } from "./Icons";
import type { CalEvent } from "../types";

/** Selecting any day opens this: weather, your plans, and what's on locally (suburb + city). */
export function DayPanel() {
  const s = useStore();
  const day = s.selectedDay!;
  const date = fromYmd(day);
  const wx = useForecast();
  const w = wx.data?.daily.find((d) => d.date === day);
  const occ = occurrencesOnDay(calendarEvents(s), date);
  const tasks = live(s.tasks).filter((t) => t.due === day);
  const loc = s.settings.location;
  const local = useAsync(() => (loc ? localEventsFor(loc, day, s.settings.localEventsApiKey) : Promise.resolve([])), [day, loc?.lat]);
  const [edit, setEdit] = useState<{ ev: Partial<CalEvent>; occ?: string } | null>(null);
  const hourly = wx.data?.hourly.filter((h) => h.time.startsWith(day) && +h.time.slice(11, 13) % 3 === 0) ?? [];
  const move = (n: number) => s.selectDay(format(addDays(date, n), "yyyy-MM-dd"));

  return (
    <aside className="drawer" aria-label="Day details">
      <header>
        <button className="btn ghost icon" onClick={() => move(-1)} aria-label="Previous day">
          <ILeft />
        </button>
        <h3>{format(date, "EEEE d MMMM")}</h3>
        <button className="btn ghost icon" onClick={() => move(1)} aria-label="Next day">
          <IRight />
        </button>
        <button className="btn ghost icon" onClick={() => s.selectDay(null)} aria-label="Close">
          <IX />
        </button>
      </header>
      <div className="body">
        <section>
          <div className="eyebrow">Weather{loc ? ` · ${loc.name}` : ""}</div>
          {w ? (
            <div className="row" style={{ gap: 16, marginTop: 8 }}>
              <WeatherIcon sky={skyOf(w.code).sky} size={44} />
              <div>
                <div style={{ font: "500 30px var(--font-display)" }}>
                  {Math.round(w.max)}
                  {tempUnit(s.settings.units)}{" "}
                  <span className="muted" style={{ fontSize: 18 }}>
                    / {Math.round(w.min)}°
                  </span>
                </div>
                <div className="muted">
                  {skyOf(w.code).label} · rain {w.rainChance}% · UV {Math.round(w.uv)} · wind {Math.round(w.wind)}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">
              {loc ? (wx.loading ? "Loading forecast…" : "No forecast this far ahead (16-day limit).") : "Set a location in Settings."}
            </div>
          )}
          {hourly.length > 0 && (
            <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
              {hourly.map((h) => (
                <div key={h.time} style={{ display: "grid", justifyItems: "center", gap: 2, fontSize: 11.5 }} className="mono">
                  <span className="faint">{h.time.slice(11, 13)}</span>
                  <WeatherIcon sky={skyOf(h.code).sky} size={18} />
                  <span>{Math.round(h.temp)}°</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="card-title">
            Your plans <span className="spacer" />
            <button
              className="btn sm"
              onClick={() =>
                setEdit({
                  ev: { start: localIso(new Date(date.getTime() + 9 * 3600e3)), end: localIso(new Date(date.getTime() + 10 * 3600e3)) },
                })
              }
            >
              <IPlus size={14} /> Event
            </button>
          </div>
          <div className="list">
            {occ.map((o) => (
              <div
                key={o.key}
                className="agenda-item"
                style={{ cursor: "pointer" }}
                onClick={() => (isBirthdayEvent(o.event) ? s.setPage("contacts") : setEdit({ ev: o.event, occ: day }))}
              >
                <span className="when">{o.event.allDay ? "all day" : fmtTime(o.start, s.settings.clock24)}</span>
                <span>
                  <span className="what">{o.event.title}</span>
                  {o.event.location && <div className="where">{o.event.location}</div>}
                </span>
              </div>
            ))}
            {tasks.map((t) => (
              <div key={t.id} className="agenda-item">
                <span className="when">task</span>
                <span className={t.done ? "faint" : ""} style={{ textDecoration: t.done ? "line-through" : undefined }}>
                  {t.title}
                </span>
              </div>
            ))}
            {!occ.length && !tasks.length && <div className="empty">Nothing planned.</div>}
          </div>
        </section>

        {loc && (
          <section>
            <div className="card-title">
              Around {loc.name}
              {loc.city && loc.city !== loc.name ? ` & ${loc.city}` : ""}
            </div>
            <div className="list">
              {(local.data ?? []).map((e) => (
                <a
                  key={e.id}
                  href={e.url}
                  onClick={(ev) => {
                    ev.preventDefault();
                    openUrl(e.url);
                  }}
                  className="agenda-item"
                  style={{ textDecoration: "none" }}
                >
                  <span className="when">{e.start.length > 10 ? e.start.slice(11, 16) : ""}</span>
                  <span>
                    <span className="what">{e.name}</span>
                    <div className="where">{[e.venue, e.category].filter(Boolean).join(" · ")}</div>
                  </span>
                </a>
              ))}
              {!s.settings.localEventsApiKey && (
                <div className="faint" style={{ fontSize: 12.5 }}>
                  Add a free Ticketmaster key in Settings → Local events to list events here.
                </div>
              )}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              {localSearchLinks(loc, format(date, "d MMMM yyyy")).map((l) => (
                <button key={l.url} className="btn sm" onClick={() => openUrl(l.url)}>
                  {l.label} <IExternal size={13} />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      {edit && <EventEditor initial={edit.ev} occurrenceDate={edit.occ} onClose={() => setEdit(null)} />}
    </aside>
  );
}
