import { kickoff, nextMatches, type Match } from "./sports";
import { mergeFixtures, type Fixture } from "./fixtures";
import { localIso } from "./util";
import { useStore } from "../store";
import { useDriveSync } from "./driveSyncApp";
import type { CalEvent } from "../types";

/**
 * Keeps games of the teams you follow in the main calendar. Each game becomes one event with the id `sports:<gameId>`,
 * so running this again never duplicates a game, a game that moved is updated, and a game you deleted stays deleted.
 * Turned off with `settings.pages.sports.autoCalendar === false` (Sports page toggle).
 */

export const sportsEventId = (f: Pick<Match, "id">) => `sports:${f.id}`;

type Existing = Record<string, Pick<CalEvent, "start" | "end" | "location" | "deleted"> | undefined>;
export type SportsEventPatch = Pick<
  CalEvent,
  "id" | "title" | "start" | "end" | "allDay" | "location" | "source" | "reminderMins" | "notes"
>;

export const sportsEvent = (f: Match): SportsEventPatch => {
  const start = kickoff(f);
  return {
    id: sportsEventId(f),
    title: `${f.home} v ${f.away}`,
    start: localIso(start),
    end: localIso(new Date(start.getTime() + 2 * 3600e3)),
    allDay: false,
    location: f.venue,
    source: "sports",
    reminderMins: [30],
    notes: f.league,
  };
};

/** Events to write: games not yet in the calendar, and games whose time or venue changed. Never resurrects a deleted one. Pure. */
export function planSportsEvents(fixtures: Fixture[], existing: Existing, now = new Date()): SportsEventPatch[] {
  const out: SportsEventPatch[] = [];
  for (const f of fixtures) {
    if (kickoff(f).getTime() < now.getTime()) continue;
    const ev = sportsEvent(f);
    const have = existing[ev.id];
    if (!have) out.push(ev);
    else if (!have.deleted && (have.start !== ev.start || have.end !== ev.end || (have.location ?? "") !== (ev.location ?? "")))
      out.push(ev);
  }
  return out;
}

let running: Promise<number> | null = null;

/** Fetch upcoming games for every followed team and add or update their calendar events. Resolves to how many were written. */
export function syncSportsToCalendar(): Promise<number> {
  running ??= (async () => {
    const st = useStore.getState();
    const { teams, sportsApiKey } = st.settings;
    if (!st.settings.onboarded || st.settings.pages.sports.autoCalendar === false || !teams.length) return 0;
    const lists = await Promise.all(
      teams.map((t) =>
        nextMatches(t.id, sportsApiKey).then(
          (matches) => ({ teamId: t.id, matches }),
          () => ({ teamId: t.id, matches: [] }),
        ),
      ),
    );
    // the toggle may have been switched off while we were fetching
    if (useStore.getState().settings.pages.sports.autoCalendar === false) return 0;
    const plan = planSportsEvents(mergeFixtures(lists), useStore.getState().events);
    for (const ev of plan) useStore.getState().upsert("events", ev);
    return plan.length;
  })().finally(() => (running = null));
  return running;
}

/** When the app opens, when its window returns, every 30 minutes, and right after a Drive sync finishes. */
export function startSportsCalendar(): () => void {
  const run = () => void syncSportsToCalendar().catch(() => {});
  run();
  const timer = setInterval(run, 30 * 60_000);
  const onVisible = () => document.visibilityState === "visible" && run();
  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", onVisible);
  const offDrive = useDriveSync.subscribe((s, prev) => {
    if (prev.syncing && !s.syncing) run();
  });
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", onVisible);
    offDrive();
  };
}
