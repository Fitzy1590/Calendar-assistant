import { describe, expect, it } from "vitest";
import type { Subscription } from "../subscriptions";
import { dueAlerts, fromDetected, hikePercent, isPriceHike, monthlyCents, priceHikes, type SubRecord } from "./subscriptionTracker";

describe("isPriceHike", () => {
  it("is a hike only above +3%", () => {
    expect(isPriceHike(10000, 10300)).toBe(false); // exactly 1.03 is not a hike
    expect(isPriceHike(10000, 10301)).toBe(true);
    expect(isPriceHike(1999, 2299)).toBe(true);
    expect(isPriceHike(1999, 1999)).toBe(false);
    expect(isPriceHike(1999, 1500)).toBe(false);
    expect(isPriceHike(0, 500)).toBe(false);
  });
  it("rounds the percentage", () => expect(hikePercent(1999, 2299)).toBe(15));
});

describe("fromDetected", () => {
  const s = (p: Partial<Subscription>): Subscription => ({
    id: "x",
    name: "Netflix",
    category: "Streaming",
    amount: 22.99,
    cadence: "monthly",
    monthly: 22.99,
    yearly: 275.88,
    lastDate: "2026-11-03",
    nextDate: "2026-12-03",
    count: 6,
    known: true,
    ...p,
  });
  it("converts dollars to cents, skips hidden, carries the price change", () => {
    const r = fromDetected([s({ priceChange: { from: 19.99, to: 22.99 } }), s({ id: "h", hidden: true })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cents: 2299, previousCents: 1999 });
    expect(priceHikes(r)).toHaveLength(1);
  });
});

describe("monthlyCents", () => {
  it("normalises cadences", () => {
    expect(monthlyCents({ cents: 1200, cadence: "yearly" })).toBe(100);
    expect(monthlyCents({ cents: 3000, cadence: "quarterly" })).toBe(1000);
    expect(monthlyCents({ cents: 1000, cadence: "monthly" })).toBe(1000);
  });
});

describe("dueAlerts", () => {
  const trial: SubRecord = { id: "t", name: "Notes Pro", cents: 999, cadence: "monthly", nextDate: "2027-01-12", trialEnds: "2026-12-12" };
  const annual: SubRecord = { id: "c", name: "Cloud", cents: 11999, cadence: "yearly", nextDate: "2027-01-04" };
  it("starts 3 days before and stops after the day", () => {
    expect(dueAlerts([trial], "2026-12-08")).toEqual([]);
    expect(dueAlerts([trial], "2026-12-09")).toHaveLength(1);
    expect(dueAlerts([trial], "2026-12-12")).toHaveLength(1);
    expect(dueAlerts([trial], "2026-12-13")).toEqual([]);
  });
  it("alerts for yearly renewals, not monthly ones", () => {
    expect(dueAlerts([annual], "2027-01-01")[0]).toMatchObject({ kind: "renewal", date: "2027-01-04", id: "c:renewal:2027-01-04" });
    expect(dueAlerts([{ ...annual, cadence: "monthly" }], "2027-01-01")).toEqual([]);
  });
  it("crosses a year end", () => expect(dueAlerts([{ ...annual, nextDate: "2027-01-01" }], "2026-12-29")).toHaveLength(1));
});
