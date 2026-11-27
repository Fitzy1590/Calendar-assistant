import { describe, expect, it } from "vitest";
import { dueDates, expand, monthlyEquivalent, project, shiftWeekend } from "./cashflowEngine";
import type { FinAccount, Schedule } from "./types";

// 2026-12-05 is a Saturday, 12-06 Sunday, 12-11 Friday, 12-12 Saturday, 12-13 Sunday, 12-14 Monday.
const acct: FinAccount = { id: "a", name: "Everyday", openingCents: 142000, asOf: "2026-11-27" };
const sched = (p: Partial<Schedule> & Pick<Schedule, "id" | "kind" | "cents" | "start">): Schedule => ({
  accountId: "a",
  name: p.id,
  every: "monthly",
  ...p,
});

describe("shiftWeekend", () => {
  it("moves a payday back to Friday and a bill on to Monday", () => {
    expect(shiftWeekend("2026-12-12", "income")).toBe("2026-12-11");
    expect(shiftWeekend("2026-12-13", "income")).toBe("2026-12-11");
    expect(shiftWeekend("2026-12-05", "bill")).toBe("2026-12-07");
    expect(shiftWeekend("2026-12-06", "bill")).toBe("2026-12-07");
  });
  it("leaves weekdays alone", () => {
    expect(shiftWeekend("2026-12-09", "bill")).toBe("2026-12-09");
    expect(shiftWeekend("2026-12-11", "income")).toBe("2026-12-11");
  });
  it("crosses a month end", () => {
    // 2026-05-31 is a Sunday: bill -> Monday 06-01, payday -> Friday 05-29
    expect(shiftWeekend("2026-05-31", "bill")).toBe("2026-06-01");
    expect(shiftWeekend("2026-05-31", "income")).toBe("2026-05-29");
  });
});

describe("dueDates", () => {
  it("clamps a 31st bill to month end without drifting", () => {
    const s = sched({ id: "r", kind: "bill", cents: 1, start: "2026-01-31" });
    expect(dueDates(s, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("fortnightly, once, until", () => {
    expect(
      dueDates(sched({ id: "p", kind: "income", cents: 1, start: "2026-12-04", every: "fortnightly" }), "2026-12-01", "2027-01-10"),
    ).toEqual(["2026-12-04", "2026-12-18", "2027-01-01"]);
    expect(dueDates(sched({ id: "o", kind: "bill", cents: 1, start: "2026-12-04", every: "once" }), "2026-12-05", "2026-12-31")).toEqual(
      [],
    );
    expect(
      dueDates(
        sched({ id: "u", kind: "bill", cents: 1, start: "2026-12-01", every: "weekly", until: "2026-12-15" }),
        "2026-12-01",
        "2026-12-31",
      ),
    ).toEqual(["2026-12-01", "2026-12-08", "2026-12-15"]);
  });
});

describe("expand", () => {
  it("keeps due and effective, and includes an item shifted into the window", () => {
    const rent = sched({ id: "rent", kind: "bill", cents: 135000, start: "2026-12-05", every: "once" });
    // due Saturday 12-05, effective Monday 12-07: inside a window that starts on the 6th
    const items = expand([rent], "2026-12-06", "2026-12-10");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ due: "2026-12-05", effective: "2026-12-07" });
  });
  it("drops an item shifted out of the window", () => {
    const pay = sched({ id: "pay", kind: "income", cents: 1, start: "2026-12-13", every: "once" }); // effective 12-11
    expect(expand([pay], "2026-12-12", "2026-12-31")).toEqual([]);
  });
});

describe("project", () => {
  const schedules: Schedule[] = [
    sched({ id: "tv", kind: "bill", cents: 2299, start: "2026-12-03" }),
    sched({ id: "rent", kind: "bill", cents: 135000, start: "2026-12-05" }),
    sched({ id: "power", kind: "bill", cents: 18600, start: "2026-12-09", every: "once" }),
    sched({ id: "pay", kind: "income", cents: 230000, start: "2026-12-13" }),
  ];
  const days = project([acct], schedules, "2026-11-27", "2026-12-14", 25000);
  const on = (d: string) => days.find((x) => x.date === d)!;

  it("applies bills on their shifted day", () => {
    expect(on("2026-12-06").balanceCents).toBe(142000 - 2299); // rent not yet moved
    expect(on("2026-12-07").balanceCents).toBe(142000 - 2299 - 135000);
  });
  it("flags low and overdraft days, and pay lifts it", () => {
    expect(on("2026-12-07").flags).toEqual(["low"]); // 4701 < 25000
    expect(on("2026-12-09").balanceCents).toBe(4701 - 18600);
    expect(on("2026-12-09").flags).toEqual(["overdraft"]);
    expect(on("2026-12-10").flags).toEqual(["overdraft"]);
    expect(on("2026-12-11").balanceCents).toBe(4701 - 18600 + 230000); // Sunday pay moved to Friday
    expect(on("2026-12-11").flags).toEqual([]);
  });
  it("covers every day and uses the opening balance as the start of the first day", () => {
    expect(days).toHaveLength(18);
    expect(days[0].balanceCents).toBe(142000);
  });
  it("exactly on the buffer is not low", () => {
    const d = project([{ ...acct, openingCents: 25000 }], [], "2026-12-01", "2026-12-01", 25000);
    expect(d[0].flags).toEqual([]);
  });
  it("can be limited to one account", () => {
    const b: FinAccount = { id: "b", name: "Savings", openingCents: 500000, asOf: "2026-11-27" };
    expect(project([acct, b], [], "2026-12-01", "2026-12-01", 0)[0].balanceCents).toBe(642000);
    expect(project([acct, b], [], "2026-12-01", "2026-12-01", 0, "b")[0].balanceCents).toBe(500000);
  });
});

describe("monthlyEquivalent", () => {
  it("averages repeating items and ignores one-offs", () => {
    expect(monthlyEquivalent(1200, "yearly")).toBe(100);
    expect(monthlyEquivalent(100000, "fortnightly")).toBe(216667);
    expect(monthlyEquivalent(500, "once")).toBe(0);
  });
});
