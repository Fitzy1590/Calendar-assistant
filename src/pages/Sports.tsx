import { format } from "date-fns";
import { useState } from "react";
import type { FavTeam } from "../types";
import { toast, useStore } from "../store";
import { useAsync } from "../lib/hooks";
import { highlightsSearch, kickoff, lastMatches, nextMatches, searchTeams, sportDay, SPORTS, type Match, type Team } from "../lib/sports";
import { openUrl } from "../lib/platform";
import { ymd } from "../lib/util";
import { ICal, IPlay, IPlus, ISearch, ITrash } from "../components/Icons";
import { PageHead, Seg, Suggest, Toggle } from "../components/ui";
import { sportsEvent, syncSportsToCalendar } from "../lib/sportsCalendar";
import { POPULAR_TEAMS } from "../lib/suggest";
import { SportsUpcoming } from "../components/SportsUpcoming";

export function Sports() {
  const s = useStore();
  // no team or sport picked = the upcoming-games calendar for every team you follow
  const focus = s.sportFocus;
  const [custom, setCustom] = useState(!s.settings.teams.length && !s.settings.sports.length);
  return (
    <>
      <PageHead
        title="Sports"
        sub="Your teams and sports — results, highlights and what's next"
        open={custom}
        setOpen={setCustom}
        customise={<FollowPanel />}
      />
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
        <select
          className="input"
          style={{ width: "auto", minWidth: 220 }}
          aria-label="Team or sport"
          value={focus ? `${focus.kind}:${focus.id}` : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return s.setSportFocus(null);
            const [kind, ...rest] = v.split(":");
            s.setSportFocus({ kind: kind as "team" | "sport", id: rest.join(":") });
          }}
        >
          <option value="">Upcoming games</option>
          {s.settings.teams.length > 0 && (
            <optgroup label="Teams">
              {s.settings.teams.map((t) => (
                <option key={t.id} value={`team:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          {s.settings.sports.length > 0 && (
            <optgroup label="Sports">
              {s.settings.sports.map((sp) => (
                <option key={sp} value={`sport:${sp}`}>
                  {sp}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {s.settings.teams.length > 0 && <AutoCalendarToggle />}
      </div>
      {focus?.kind === "team" && <TeamView team={s.settings.teams.find((t) => t.id === focus.id)!} />}
      {focus?.kind === "sport" && <SportView sport={focus.id} />}
      {!focus && <SportsUpcoming />}
    </>
  );
}

/** Switch for adding games of followed teams to the main calendar automatically. */
function AutoCalendarToggle() {
  const on = useStore((s) => s.settings.pages.sports.autoCalendar !== false);
  const set = (v: boolean) => {
    useStore.getState().updateSettings((st) => void (st.pages.sports.autoCalendar = v));
    if (v)
      void syncSportsToCalendar().then((n) =>
        toast(n ? `Added ${n} game${n === 1 ? "" : "s"} to your calendar` : "Calendar is up to date"),
      );
  };
  const why = on
    ? "Upcoming games of the teams you follow are added when the app opens and on every sync. Games already added stay; delete one and it won't come back."
    : "Off. Games only appear here in Sports. Games already in your calendar stay until you delete them.";
  return (
    <span className="row" style={{ gap: 8 }} title={why}>
      <span className="muted" style={{ fontSize: 13 }}>
        Add games to my calendar
      </span>
      <Toggle checked={on} onChange={set} label={`Add sports games to my main calendar. ${why}`} />
    </span>
  );
}

export function FollowPanel() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Team[]>([]);
  const key = s.settings.sportsApiKey;
  const find = async (query: string) => {
    setQ(query);
    try {
      setResults(await searchTeams(query, key));
    } catch (err) {
      toast(String(err));
    }
  };
  const follow = (t: Team) => {
    if (s.settings.teams.some((x) => x.id === t.id)) return;
    s.updateSettings((st) => void st.teams.push({ id: t.id, name: t.name, sport: t.sport, league: t.league, badge: t.badge } as FavTeam));
    toast(`Following ${t.name}`);
  };
  return (
    <div className="stack">
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Sports in the left menu
        </div>
        <div className="row">
          {SPORTS.map((sp) => (
            <button
              key={sp}
              className="chip"
              aria-pressed={s.settings.sports.includes(sp)}
              onClick={() =>
                s.updateSettings((st) => {
                  st.sports = st.sports.includes(sp) ? st.sports.filter((x) => x !== sp) : [...st.sports, sp];
                })
              }
            >
              {sp}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Favourite teams
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void find(q);
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 320 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a team, e.g. Sydney Swans, Arsenal"
          />
          <button className="btn">
            <ISearch size={16} /> Find
          </button>
        </form>
        <Suggest
          label="Popular"
          items={POPULAR_TEAMS.filter((n) => !s.settings.teams.some((t) => t.name === n)).map((n) => ({
            label: n,
            onUse: () => void find(n),
          }))}
        />
        <div className="list" style={{ marginTop: 8 }}>
          {results.slice(0, 8).map((t) => (
            <div key={t.id} className="row" style={{ justifyContent: "space-between" }}>
              <span className="row">
                {t.badge && <img className="badge-img" src={t.badge} alt="" />}
                <b>{t.name}</b>
                <span className="faint">
                  {t.sport} · {t.league}
                </span>
              </span>
              <button className="btn sm" onClick={() => follow(t)}>
                <IPlus size={14} /> Follow
              </button>
            </div>
          ))}
          {s.settings.teams.map((t) => (
            <div key={t.id} className="row" style={{ justifyContent: "space-between" }}>
              <span className="row">
                {t.badge && <img className="badge-img" src={t.badge} alt="" />}
                {t.name} <span className="tag">following</span>
              </span>
              <button
                className="btn sm ghost"
                onClick={() => s.updateSettings((st) => void (st.teams = st.teams.filter((x) => x.id !== t.id)))}
              >
                <ITrash size={14} /> Unfollow
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function addToCalendar(m: Match) {
  useStore.getState().upsert("events", sportsEvent(m));
  toast("Added to calendar");
}

function MatchRow({ m, past }: { m: Match; past?: boolean }) {
  const k = kickoff(m);
  return (
    <div className="match-card">
      <div className="match-date" aria-hidden="true">
        <b>{format(k, "d")}</b>
        <span>{format(k, "EEE")}</span>
      </div>
      <div className="match-main">
        <div className="match-title">
          {m.home} {past ? <span className="mono">{`${m.homeScore ?? "–"} : ${m.awayScore ?? "–"}`}</span> : "v"} {m.away}
        </div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          {format(k, "EEEE d MMM")}
          {past ? "" : ` · ${format(k, "h:mm a")}`}
          {m.venue ? ` · ${m.venue}` : ""}
          {m.league ? ` · ${m.league}` : ""}
        </div>
      </div>
      {past ? (
        <button className="btn sm ghost" onClick={() => openUrl(highlightsSearch(m))}>
          <IPlay size={14} /> Highlights
        </button>
      ) : (
        <button className="btn sm ghost" onClick={() => addToCalendar(m)}>
          <ICal size={14} /> Add to calendar
        </button>
      )}
    </div>
  );
}

function TeamView({ team }: { team: FavTeam }) {
  const s = useStore();
  const key = s.settings.sportsApiKey;
  const n = s.settings.pages.sports.resultsCount;
  const [tab, setTab] = useState<"upcoming" | "results">("upcoming");
  const next = useAsync(() => nextMatches(team.id, key), [team.id]);
  const last = useAsync(() => lastMatches(team.id, key), [team.id]);
  const nextM = next.data?.[0];
  const lastM = last.data?.[0];
  return (
    <div className="stack">
      <section className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 14 }}>
          {team.badge && <img src={team.badge} alt="" width={56} height={56} />}
          <div>
            <div style={{ font: "600 26px var(--font-display)" }}>{team.name}</div>
            <div className="muted">
              {team.sport} · {team.league}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => openUrl(`https://news.google.com/search?q=${encodeURIComponent(team.name)}`)}>
            Team news
          </button>
          <button
            className="btn"
            onClick={() => openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(team.name + " highlights")}`)}
          >
            <IPlay size={15} /> All highlights
          </button>
        </div>
        <div className="team-summary">
          <div>
            <span className="faint">Next</span>{" "}
            <b>
              {nextM
                ? `${nextM.home} v ${nextM.away}, ${format(kickoff(nextM), "EEE d MMM, h:mm a")}`
                : next.data
                  ? "No fixtures listed yet"
                  : "…"}
            </b>
          </div>
          <div>
            <span className="faint">Last</span>{" "}
            <b>
              {lastM
                ? `${lastM.home} ${lastM.homeScore ?? "–"} : ${lastM.awayScore ?? "–"} ${lastM.away}`
                : last.data
                  ? "No recent results"
                  : "…"}
            </b>
          </div>
        </div>
      </section>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "results", label: "Results" },
          ]}
        />
        {tab === "upcoming" && (next.data?.length ?? 0) > 0 && (
          <button className="btn sm ghost" onClick={() => next.data!.forEach(addToCalendar)}>
            Add all to calendar
          </button>
        )}
      </div>
      <section className="card">
        <div className="list">
          {tab === "upcoming" ? (
            <>
              {(next.data ?? []).map((m) => (
                <MatchRow key={m.id} m={m} />
              ))}
              {next.data && !next.data.length && <div className="empty">No fixtures listed yet.</div>}
              {next.error && <div className="empty">Couldn't load fixtures: {next.error}</div>}
            </>
          ) : (
            <>
              {(last.data ?? []).slice(0, n).map((m) => (
                <MatchRow key={m.id} m={m} past />
              ))}
              {last.data && !last.data.length && <div className="empty">No recent results.</div>}
              {last.error && <div className="empty">Couldn't load results: {last.error}</div>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function SportView({ sport }: { sport: string }) {
  const key = useStore((s) => s.settings.sportsApiKey);
  const [day, setDay] = useState(ymd(new Date()));
  const data = useAsync(() => sportDay(sport, day, key), [sport, day]);
  const byLeague = new Map<string, Match[]>();
  for (const m of data.data ?? []) byLeague.set(m.league ?? "Other", [...(byLeague.get(m.league ?? "Other") ?? []), m]);
  return (
    <div className="stack">
      <div className="row">
        <b style={{ font: "600 22px var(--font-display)" }}>{sport}</b>
        <span style={{ flex: 1 }} />
        <input type="date" className="input" style={{ width: 160 }} value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      {[...byLeague].map(([league, list]) => (
        <section key={league} className="card">
          <h2>{league}</h2>
          <div className="list">
            {list.map((m) => (
              <MatchRow key={m.id} m={m} past={!!m.homeScore} />
            ))}
          </div>
        </section>
      ))}
      {data.data && !data.data.length && <div className="empty">No {sport.toLowerCase()} listed for this day.</div>}
      {data.error && <div className="empty">Couldn't load: {data.error}</div>}
    </div>
  );
}
