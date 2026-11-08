import { cached, getJson } from "./http";

/**
 * TheSportsDB v1 JSON API (https://www.thesportsdb.com/free_sports_api).
 * "123" is the public free key; paste a Patreon key in Settings for higher limits.
 */
const base = (key: string) => `https://www.thesportsdb.com/api/v1/json/${key || "123"}`;

export const SPORTS = [
  "Soccer",
  "Australian Football",
  "Rugby",
  "Cricket",
  "Basketball",
  "American Football",
  "Baseball",
  "Ice Hockey",
  "Motorsport",
  "Tennis",
  "Golf",
];

export interface Team {
  id: string;
  name: string;
  sport: string;
  league?: string;
  badge?: string;
  stadium?: string;
}
export interface Match {
  id: string;
  name: string;
  home: string;
  away: string;
  homeScore?: string | null;
  awayScore?: string | null;
  date: string; // yyyy-mm-dd
  time?: string; // HH:mm:ss UTC
  venue?: string;
  league?: string;
  video?: string;
  thumb?: string;
}

const toTeam = (t: any): Team => ({
  id: t.idTeam,
  name: t.strTeam,
  sport: t.strSport,
  league: t.strLeague,
  badge: t.strBadge || t.strTeamBadge,
  stadium: t.strStadium,
});
const toMatch = (e: any): Match => ({
  id: e.idEvent,
  name: e.strEvent,
  home: e.strHomeTeam,
  away: e.strAwayTeam,
  homeScore: e.intHomeScore,
  awayScore: e.intAwayScore,
  date: e.dateEvent,
  time: e.strTime,
  venue: e.strVenue,
  league: e.strLeague,
  video: e.strVideo,
  thumb: e.strThumb,
});

export async function searchTeams(q: string, key: string): Promise<Team[]> {
  if (q.trim().length < 2) return [];
  const j = await getJson<any>(`${base(key)}/searchteams.php?t=${encodeURIComponent(q)}`);
  return (j.teams ?? []).map(toTeam);
}

export async function nextMatches(teamId: string, key: string): Promise<Match[]> {
  return cached(`sp:next:${teamId}`, 30 * 60e3, async () => {
    const j = await getJson<any>(`${base(key)}/eventsnext.php?id=${teamId}`);
    return (j.events ?? []).map(toMatch);
  });
}

export async function lastMatches(teamId: string, key: string): Promise<Match[]> {
  return cached(`sp:last:${teamId}`, 30 * 60e3, async () => {
    const j = await getJson<any>(`${base(key)}/eventslast.php?id=${teamId}`);
    return (j.results ?? []).map(toMatch);
  });
}

/** Everything scheduled for a sport on a given day (used by the sport drop-down). */
export async function sportDay(sport: string, day: string, key: string): Promise<Match[]> {
  return cached(`sp:day:${sport}:${day}`, 30 * 60e3, async () => {
    const j = await getJson<any>(`${base(key)}/eventsday.php?d=${day}&s=${encodeURIComponent(sport)}`);
    return (j.events ?? []).map(toMatch);
  });
}

export const highlightsSearch = (m: Match) =>
  m.video || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${m.home} vs ${m.away} highlights ${m.date}`)}`;

export const kickoff = (m: Match) => (m.time ? new Date(`${m.date}T${m.time.slice(0, 8)}Z`) : new Date(`${m.date}T00:00`));
