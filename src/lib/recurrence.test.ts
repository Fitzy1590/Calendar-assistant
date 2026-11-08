import { describe, expect, it } from "vitest";
import { occurrences } from "./recurrence";
import type { CalEvent } from "../types";

const base: CalEvent = { id: "e1", updatedAt: 0, title: "x", start: "2026-01-05T09:00", end: "2026-01-05T10:00", allDay: false };

describe("occurrences", () => {
  it("returns single events in range", () => {
    expect(occurrences(base, new Date(2026, 0, 1), new Date(2026, 0, 31))).toHaveLength(1);
    expect(occurrences(base, new Date(2026, 1, 1), new Date(2026, 1, 28))).toHaveLength(0);
  });
  it("expands weekly by weekday", () => {
    const ev = { ...base, recurrence: { freq: "weekly" as const, interval: 1, byWeekday: [1, 3] } };
    const occ = occurrences(ev, new Date(2026, 0, 1), new Date(2026, 0, 15));
    expect(occ.map((o) => o.start.getDate())).toEqual([5, 7, 12, 14]);
  });
  it("respects count, until and exceptions", () => {
    const ev = { ...base, recurrence: { freq: "daily" as const, interval: 1, count: 3 }, exceptions: ["2026-01-06"] };
    const occ = occurrences(ev, new Date(2026, 0, 1), new Date(2026, 1, 1));
    expect(occ.map((o) => o.start.getDate())).toEqual([5, 7]);
    const ev2 = { ...base, recurrence: { freq: "daily" as const, interval: 2, until: "2026-01-09" } };
    expect(occurrences(ev2, new Date(2026, 0, 1), new Date(2026, 1, 1)).map((o) => o.start.getDate())).toEqual([5, 7, 9]);
  });
  it("skips months without the day for monthly on the 31st", () => {
    const ev = { ...base, start: "2026-01-31T09:00", end: "2026-01-31T10:00", recurrence: { freq: "monthly" as const, interval: 1 } };
    const occ = occurrences(ev, new Date(2026, 0, 1), new Date(2026, 4, 1));
    expect(occ.map((o) => o.start.getMonth())).toEqual([0, 2]);
  });
});
