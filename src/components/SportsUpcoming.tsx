import { addMonths, addWeeks, format, isSameMonth, isToday } from "date-fns";
import { useState } from "react";
import { toast, useStore } from "../store";
import { useAsync } from "../lib/hooks";
import { filterFixtures, fixturesOn, groupByDay, mergeFixtures, monthGrid, weekDays, type Fixture } from "../lib/fixtures";
import { kickoff, nextMatches } from "../lib/sports";
import { fromYmd, localIso, ymd } from "../lib/util";
import { ICal } from "./Icons";
import { Seg } from "./ui";

/** Sports home: upcoming games of the teams you follow, as a week or month calendar, or a list; filter by team. */

const label = (f: Fixture) => `${f.home} v ${f.away}`;
const when = (f: Fixture) => format(kickoff(f), "EEE d MMM, h:mm a");

function addToCalendar(f: Fixture) {
  const start = kickoff(f);
  useStore.getState().upsert("events", {
    title: label(f),
    start: localIso(start),
    end: localIso(new Date(start.getTime() + 2 * 3600e3)),
    allDay: false,
    location: f.venue,
    source: "sports",
    reminderMins: [30],
    notes: f.league,
  });
  toast("Added to calendar");
}

function GameRow({ f }: { f: Fixture }) {
  return (
    <div className="fx-row">
      <div>
        <b>{label(f)}</b>
        <div className="faint" style={{ fontSize: 12.5 }}>
          {when(f)}
          {f.venue ? ` · ${f.venue}` : ""}
          {f.league ? ` · ${f.league}` : ""}
        </div>
      </div>
      <button className="btn sm ghost" onClick={() => addToCalendar(f)} aria-label={`Add ${label(f)} to calendar`}>
        <ICal size={14} /> Add to calendar
      </button>
    </div>
  );
}

function Chip({ f, onPick }: { f: Fixture; onPick: () => void }) {
  return (
    <button className="fx-chip" onClick={onPick} aria-label={`${label(f)}, ${when(f)}`}>
      <span className="ellipsis">{label(f)}</span>
      <span className="fx-time">{format(kickoff(f), "h:mm a")}</span>
    </button>
  );
}

export function SportsUpcoming() {
  const s = useStore();
  const teams = s.settings.teams;
  const key = s.settings.sportsApiKey;
  const pref = s.settings.pages.sports;
  const view = pref.view ?? "calendar";
  const range = pref.range ?? "week";
  const setPref = (patch: Partial<typeof pref>) => s.updateSettings((st) => void Object.assign(st.pages.sports, patch));
  const [anchor, setAnchor] = useState(() => new Date());
  const [picked, setPicked] = useState<string[]>([]); // team filter; empty = all teams
  const [day, setDay] = useState<string | null>(null);

  const data = useAsync(
    () =>
      Promise.all(
        teams.map((t) =>
          nextMatches(t.id, key).then(
            (matches) => ({ teamId: t.id, matches }),
            () => ({ teamId: t.id, matches: [] }),
          ),
        ),
      ),
    [teams.map((t) => t.id).join(",")],
  );
  const all = filterFixtures(mergeFixtures(data.data ?? []), picked);
  const wk = s.settings.weekStartsOn;
  const step = (dir: 1 | -1) => setAnchor((a) => (range === "week" ? addWeeks(a, dir) : addMonths(a, dir)));
  const title =
    range === "week"
      ? `${format(weekDays(anchor, wk)[0], "d MMM")} – ${format(weekDays(anchor, wk)[6], "d MMM yyyy")}`
      : format(anchor, "MMMM yyyy");
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (!teams.length)
    return <div className="empty">Follow a team (Customise, top right) to see its upcoming games here, as a calendar or a list.</div>;

  const grid = range === "week" ? [weekDays(anchor, wk)] : monthGrid(anchor, wk);
  const heads = weekDays(anchor, wk);
  const dayGames = day ? fixturesOn(all, fromYmd(day)) : [];

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <Seg
          value={view}
          options={[
            { value: "calendar", label: "Calendar" },
            { value: "list", label: "List" },
          ]}
          onChange={(v) => setPref({ view: v })}
        />
        {view === "calendar" && (
          <span className="row">
            <Seg
              value={range}
              options={[
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
              onChange={(v) => setPref({ range: v })}
            />
            <button className="btn sm" aria-label={range === "week" ? "Previous week" : "Previous month"} onClick={() => step(-1)}>
              ‹
            </button>
            <button className="btn sm" onClick={() => setAnchor(new Date())}>
              Today
            </button>
            <button className="btn sm" aria-label={range === "week" ? "Next week" : "Next month"} onClick={() => step(1)}>
              ›
            </button>
            <b aria-live="polite">{title}</b>
          </span>
        )}
      </div>

      <div className="row" role="group" aria-label="Filter by team" style={{ flexWrap: "wrap" }}>
        <button className="chip" aria-pressed={picked.length === 0} onClick={() => setPicked([])}>
          All teams
        </button>
        {teams.map((t) => (
          <button key={t.id} className="chip" aria-pressed={picked.includes(t.id)} onClick={() => toggle(t.id)}>
            {t.badge && <img src={t.badge} alt="" width={16} height={16} />} {t.name}
          </button>
        ))}
      </div>

      {data.loading && <div className="muted">Loading games…</div>}
      {data.error && <div className="alert bad">Couldn't load games: {data.error}</div>}

      {!data.loading && view === "list" && (
        <div className="stack">
          {groupByDay(all).map((g) => (
            <section key={g.day} className="card">
              <div className="eyebrow">{format(fromYmd(g.day), "EEEE d MMMM")}</div>
              {g.games.map((f) => (
                <GameRow key={f.id} f={f} />
              ))}
            </section>
          ))}
          {!all.length && <div className="empty">No upcoming games found for these teams.</div>}
        </div>
      )}

      {!data.loading && view === "calendar" && (
        <>
          <div className={"fx-grid " + range} role="grid" aria-label={title}>
            <div className="fx-heads" role="row">
              {heads.map((d) => (
                <div key={ymd(d)} role="columnheader" className="eyebrow">
                  {format(d, "EEE")}
                </div>
              ))}
            </div>
            {grid.map((row) => (
              <div key={ymd(row[0])} className="fx-weekrow" role="row">
                {row.map((d) => {
                  const games = fixturesOn(all, d);
                  const out = range === "month" && !isSameMonth(d, anchor);
                  return (
                    <div
                      key={ymd(d)}
                      role="gridcell"
                      className={"fx-day" + (isToday(d) ? " today" : "") + (out ? " out" : "") + (day === ymd(d) ? " picked" : "")}
                      aria-label={`${format(d, "EEEE d MMMM")}, ${games.length} game${games.length === 1 ? "" : "s"}`}
                    >
                      <button className="fx-num" onClick={() => setDay(day === ymd(d) ? null : ymd(d))} aria-pressed={day === ymd(d)}>
                        <span className="fx-wd">{format(d, "EEE")} </span>
                        {format(d, "d")}
                      </button>
                      {games.slice(0, range === "month" ? 3 : 8).map((f) => (
                        <Chip key={f.id} f={f} onPick={() => setDay(ymd(d))} />
                      ))}
                      {range === "month" && games.length > 3 && <span className="faint fx-more">+{games.length - 3} more</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {day && (
            <section className="card">
              <div className="eyebrow">{format(fromYmd(day), "EEEE d MMMM")}</div>
              {dayGames.length ? dayGames.map((f) => <GameRow key={f.id} f={f} />) : <div className="muted">No games this day.</div>}
              <button className="btn sm ghost" onClick={() => setDay(null)}>
                Close
              </button>
            </section>
          )}
          {!all.length && (
            <div className="muted">
              No upcoming games found for these teams. Fixtures come from TheSportsDB and cover the next few games.
            </div>
          )}
        </>
      )}
    </div>
  );
}
