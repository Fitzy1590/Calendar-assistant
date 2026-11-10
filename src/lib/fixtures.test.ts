import { describe, expect, it } from "vitest";
import { filterFixtures, fixturesOn, groupByDay, mergeFixtures, monthGrid, weekDays } from "./fixtures";
import type { Match } from "./sports";
import { ymd } from "./util";

const m = (id: string, date: string, time = "09:00:00"): Match => ({ id, name: id, home: "A" + id, away: "B" + id, date, time });

describe("fixtures", () => {
  it("merges teams' games, keeps a shared game once and sorts by kickoff", () => {
    const all = mergeFixtures([
      { teamId: "t1", matches: [m("2", "2026-11-14"), m("1", "2026-11-12")] },
      { teamId: "t2", matches: [m("2", "2026-11-14"), m("3", "2026-11-13")] },
    ]);
    expect(all.map((f) => f.id)).toEqual(["1", "3", "2"]);
    expect(all.find((f) => f.id === "2")?.teamIds).toEqual(["t1", "t2"]);
  });
  it("filters by team, and empty means everyone", () => {
    const all = mergeFixtures([
      { teamId: "t1", matches: [m("1", "2026-11-12")] },
      { teamId: "t2", matches: [m("2", "2026-11-13")] },
    ]);
    expect(filterFixtures(all, []).length).toBe(2);
    expect(filterFixtures(all, ["t2"]).map((f) => f.id)).toEqual(["2"]);
    expect(filterFixtures(all, ["t1", "t2"]).length).toBe(2);
    expect(filterFixtures(all, ["nope"]).length).toBe(0);
  });
  it("lays out a week starting Monday or Sunday", () => {
    const wed = new Date(2026, 10, 11); // Wed 11 Nov 2026
    expect(weekDays(wed, 1).map(ymd)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(ymd(weekDays(wed, 0)[0])).toBe("2026-11-08");
  });
  it("lays out whole weeks for a month", () => {
    const g = monthGrid(new Date(2026, 10, 11), 1);
    expect(g.every((row) => row.length === 7)).toBe(true);
    expect(ymd(g[0][0])).toBe("2026-10-26");
    expect(ymd(g[g.length - 1][6])).toBe("2026-12-06");
    expect(g.length).toBe(6);
    expect(monthGrid(new Date(2026, 1, 10), 1).length).toBe(5); // Feb 2026 starts on a Sunday: Jan 26 to Mar 1
  });
  it("finds a day's games and groups a list by day", () => {
    const all = mergeFixtures([
      { teamId: "t1", matches: [m("1", "2026-11-12", "05:00:00"), m("2", "2026-11-12", "08:00:00"), m("3", "2026-11-13", "05:00:00")] },
    ]);
    expect(fixturesOn(all, new Date(2026, 10, 12)).length).toBeGreaterThanOrEqual(1);
    const groups = groupByDay(all);
    expect(groups.reduce((n, g) => n + g.games.length, 0)).toBe(3);
    expect(new Set(groups.map((g) => g.day)).size).toBe(groups.length);
  });
});
