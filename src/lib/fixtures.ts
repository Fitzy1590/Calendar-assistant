import { addDays, addMonths, startOfMonth, startOfWeek } from "date-fns";
import { kickoff, type Match } from "./sports";
import { ymd } from "./util";

/** Upcoming games across the teams you follow, laid out for a week, a month or a list. Pure. */

export type Fixture = Match & { teamIds: string[] };

/** One list of games per team → one list: a game two followed teams play in is kept once, sorted by kickoff. */
export function mergeFixtures(lists: { teamId: string; matches: Match[] }[]): Fixture[] {
  const byId = new Map<string, Fixture>();
  for (const l of lists)
    for (const m of l.matches) {
      const have = byId.get(m.id);
      if (have) {
        if (!have.teamIds.includes(l.teamId)) have.teamIds.push(l.teamId);
      } else byId.set(m.id, { ...m, teamIds: [l.teamId] });
    }
  return [...byId.values()].sort((a, b) => kickoff(a).getTime() - kickoff(b).getTime());
}

/** `teamIds` empty = every team. */
export const filterFixtures = (all: Fixture[], teamIds: string[]) =>
  teamIds.length ? all.filter((f) => f.teamIds.some((t) => teamIds.includes(t))) : all;

export const fixturesOn = (all: Fixture[], day: Date) => all.filter((f) => ymd(kickoff(f)) === ymd(day));

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function weekDays(anchor: Date, weekStartsOn: WeekStart): Date[] {
  const s = startOfWeek(anchor, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** Whole weeks covering the month of `anchor`, as rows of 7 days. */
export function monthGrid(anchor: Date, weekStartsOn: WeekStart): Date[][] {
  const first = startOfWeek(startOfMonth(anchor), { weekStartsOn });
  const last = addDays(startOfWeek(addDays(startOfMonth(addMonths(anchor, 1)), -1), { weekStartsOn }), 6);
  const rows: Date[][] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) rows.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return rows;
}

/** Games from today on, grouped by local day, for the list view. */
export function groupByDay(all: Fixture[]): { day: string; games: Fixture[] }[] {
  const out: { day: string; games: Fixture[] }[] = [];
  for (const f of all) {
    const day = ymd(kickoff(f));
    const last = out[out.length - 1];
    if (last?.day === day) last.games.push(f);
    else out.push({ day, games: [f] });
  }
  return out;
}
