import { format } from "date-fns";
import { useState } from "react";
import type { FavTeam } from "../types";
import { toast, useStore } from "../store";
import { useAsync } from "../lib/hooks";
import { highlightsSearch, kickoff, lastMatches, nextMatches, searchTeams, sportDay, SPORTS, type Match, type Team } from "../lib/sports";
import { openUrl } from "../lib/platform";
import { localIso, ymd } from "../lib/util";
import { ICal, IPlay, IPlus, ISearch, ITrash } from "../components/Icons";
import { PageHead } from "../components/ui";
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
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        <button className="chip" aria-pressed={!focus} onClick={() => s.setSportFocus(null)}>
          Upcoming games
        </button>
        {s.settings.teams.map((t) => (
          <button key={t.id} className="chip" aria-pressed={focus?.id === t.id} onClick={() => s.setSportFocus({ kind: "team", id: t.id })}>
            {t.badge && <img src={t.badge} alt="" width={16} height={16} />} {t.name}
          </button>
        ))}
        {s.settings.sports.map((sp) => (
          <button key={sp} className="chip" aria-pressed={focus?.id === sp} onClick={() => s.setSportFocus({ kind: "sport", id: sp })}>
            {sp}
          </button>
        ))}
      </div>
      {focus?.kind === "team" && <TeamView team={s.settings.teams.find((t) => t.id === focus.id)!} />}
      {focus?.kind === "sport" && <SportView sport={focus.id} />}
      {!focus && <SportsUpcoming />}
    </>
  );
}

export function FollowPanel() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Team[]>([]);
  const key = s.settings.sportsApiKey;
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
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setResults(await searchTeams(q, key));
            } catch (err) {
              toast(String(err));
            }
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
  const start = kickoff(m);
  useStore.getState().upsert("events", {
    title: `${m.home} v ${m.away}`,
    start: localIso(start),
    end: localIso(new Date(start.getTime() + 2 * 3600e3)),
    allDay: false,
    location: m.venue,
    source: "sports",
    reminderMins: [30],
    notes: m.league,
  });
  toast("Added to calendar");
}

function MatchRow({ m, past }: { m: Match; past?: boolean }) {
  const k = kickoff(m);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="match">
        <span className="home">{m.home}</span>
        <span className="score">{past ? `${m.homeScore ?? "–"} : ${m.awayScore ?? "–"}` : format(k, "h:mm a")}</span>
        <span>{m.away}</span>
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <span className="faint" style={{ fontSize: 12 }}>
          {format(k, "EEE d MMM")}
          {m.venue ? ` · ${m.venue}` : ""}
          {m.league ? ` · ${m.league}` : ""}
        </span>
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
    </div>
  );
}

function TeamView({ team }: { team: FavTeam }) {
  const s = useStore();
  const key = s.settings.sportsApiKey;
  const n = s.settings.pages.sports.resultsCount;
  const next = useAsync(() => nextMatches(team.id, key), [team.id]);
  const last = useAsync(() => lastMatches(team.id, key), [team.id]);
  return (
    <div className="home">
      <section className="card" style={{ gridColumn: "span 12" }}>
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
      </section>
      <section className="card" style={{ gridColumn: "span 6" }}>
        <h2>
          Upcoming <span className="spacer" />
          {(next.data?.length ?? 0) > 0 && (
            <button className="btn sm ghost" onClick={() => next.data!.forEach(addToCalendar)}>
              Add all
            </button>
          )}
        </h2>
        <div className="list">
          {(next.data ?? []).map((m) => (
            <MatchRow key={m.id} m={m} />
          ))}
          {next.data && !next.data.length && <div className="empty">No fixtures listed yet.</div>}
          {next.error && <div className="empty">Couldn't load fixtures: {next.error}</div>}
        </div>
      </section>
      <section className="card" style={{ gridColumn: "span 6" }}>
        <h2>Recent results</h2>
        <div className="list">
          {(last.data ?? []).slice(0, n).map((m) => (
            <MatchRow key={m.id} m={m} past />
          ))}
          {last.data && !last.data.length && <div className="empty">No recent results.</div>}
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
