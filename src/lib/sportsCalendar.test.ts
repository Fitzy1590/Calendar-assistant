import { describe, expect, it } from "vitest";
import type { Fixture } from "./fixtures";
import { planSportsEvents } from "./sportsCalendar";

const fx = (id: string, date: string, time = "10:00:00", venue = "Ground"): Fixture => ({
  id,
  name: "A v B",
  home: "A",
  away: "B",
  date,
  time,
  venue,
  league: "League",
  teamIds: ["1"],
});
const now = new Date("2026-11-24T00:00:00Z");

describe("planSportsEvents", () => {
  it("adds new future games with a stable id", () => {
    const plan = planSportsEvents([fx("9", "2026-11-26")], {}, now);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ id: "sports:9", title: "A v B", source: "sports", reminderMins: [30], notes: "League" });
  });
  it("skips games already in the past", () => {
    expect(planSportsEvents([fx("1", "2026-11-20")], {}, now)).toEqual([]);
  });
  it("does not duplicate a game already added", () => {
    const first = planSportsEvents([fx("9", "2026-11-26")], {}, now)[0];
    expect(planSportsEvents([fx("9", "2026-11-26")], { [first.id]: first }, now)).toEqual([]);
  });
  it("updates a game that moved", () => {
    const first = planSportsEvents([fx("9", "2026-11-26")], {}, now)[0];
    const plan = planSportsEvents([fx("9", "2026-11-27")], { [first.id]: first }, now);
    expect(plan).toHaveLength(1);
    expect(plan[0].start).not.toBe(first.start);
  });
  it("never brings back a game you deleted", () => {
    const first = planSportsEvents([fx("9", "2026-11-26")], {}, now)[0];
    expect(planSportsEvents([fx("9", "2026-11-27")], { [first.id]: { ...first, deleted: true } }, now)).toEqual([]);
  });
});
