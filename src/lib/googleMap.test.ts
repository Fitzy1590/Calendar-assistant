import { describe, expect, it } from "vitest";
import type { CalEvent } from "../types";
import { fromGoogle, instanceInfo, parseRecurrence, syncDue, toGoogle, toRecurrenceLines } from "./googleMap";

const ev = (p: Partial<CalEvent>): CalEvent => ({
  id: "e1",
  updatedAt: 1,
  title: "Gym",
  start: "2026-11-02T18:00",
  end: "2026-11-02T19:00",
  allDay: false,
  ...p,
});

describe("recurrence lines", () => {
  it("emit an EXDATE for each skipped date (timed)", () => {
    const lines = toRecurrenceLines(
      ev({ recurrence: { freq: "weekly", interval: 1, byWeekday: [1] }, exceptions: ["2026-11-16", "2026-11-09"] }),
      "Europe/London",
    )!;
    expect(lines[0]).toBe("RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO");
    expect(lines[1]).toBe("EXDATE;TZID=Europe/London:20261109T180000,20261116T180000");
  });
  it("emit date-only EXDATEs for all-day events", () => {
    const lines = toRecurrenceLines(
      ev({
        allDay: true,
        start: "2026-11-02T00:00",
        end: "2026-11-03T00:00",
        recurrence: { freq: "daily", interval: 1 },
        exceptions: ["2026-11-05"],
      }),
      "UTC",
    )!;
    expect(lines[1]).toBe("EXDATE;VALUE=DATE:20261105");
  });
  it("send nothing when there is no series, and null in the body so a PATCH clears it", () => {
    expect(toRecurrenceLines(ev({}), "UTC")).toBeUndefined();
    expect(toGoogle(ev({})).recurrence).toBeNull();
  });
  it("read EXDATE in date, local and UTC forms", () => {
    const { recurrence, exceptions } = parseRecurrence([
      "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10",
      "EXDATE;VALUE=DATE:20261105,20261106",
      "EXDATE;TZID=Europe/London:20261110T090000",
      "EXDATE:20261112T120000Z",
    ]);
    expect(recurrence).toEqual({ freq: "weekly", interval: 2, byWeekday: [1, 3], until: undefined, count: 10 });
    expect(exceptions).toEqual(["2026-11-05", "2026-11-06", "2026-11-10", "2026-11-12"]);
  });
  it("round-trips a series with exceptions", () => {
    const src = ev({ recurrence: { freq: "daily", interval: 1, count: 5 }, exceptions: ["2026-11-03"] });
    const back = fromGoogle({
      id: "g1",
      etag: "x",
      ...toGoogle(src, "UTC"),
      start: { dateTime: "2026-11-02T18:00:00" },
      end: { dateTime: "2026-11-02T19:00:00" },
    })!;
    expect(back.recurrence).toMatchObject({ freq: "daily", interval: 1, count: 5 });
    expect(back.exceptions).toEqual(["2026-11-03"]);
  });
});

describe("google events", () => {
  it("skips cancelled events", () => {
    expect(fromGoogle({ id: "g", status: "cancelled" })).toBeNull();
  });
  it("maps all-day events with an exclusive end date", () => {
    const m = fromGoogle({ id: "g", summary: "Holiday", start: { date: "2026-12-25" }, end: { date: "2026-12-26" } })!;
    expect(m).toMatchObject({ allDay: true, start: "2026-12-25T00:00", end: "2026-12-26T00:00", googleId: "g", source: "google" });
  });
  it("identifies the series and date an instance replaces", () => {
    expect(
      instanceInfo({ id: "m_20261110", recurringEventId: "m", originalStartTime: { date: "2026-11-10" }, status: "cancelled" }),
    ).toEqual({ masterId: "m", date: "2026-11-10" });
    expect(instanceInfo({ id: "plain" })).toBeNull();
  });
});

describe("auto sync timing", () => {
  it("is due only after the interval, and never when off", () => {
    expect(syncDue(15, 0, 14 * 60_000)).toBe(false);
    expect(syncDue(15, 0, 15 * 60_000)).toBe(true);
    expect(syncDue(0, 0, 1e12)).toBe(false);
  });
});
