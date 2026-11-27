import { describe, expect, it } from "vitest";
import { pace, rollover, split503020, zeroBased } from "./budgetCalculator";

describe("split503020", () => {
  it("always sums to income", () => {
    for (const n of [0, 1, 2, 3, 99, 100, 333333, 460000, 460001]) {
      const s = split503020(n);
      expect(s.needs + s.wants + s.savings).toBe(n);
    }
  });
  it("splits a round income", () => expect(split503020(460000)).toEqual({ needs: 230000, wants: 138000, savings: 92000 }));
});

describe("zeroBased", () => {
  it("reports what is left", () => {
    expect(zeroBased(1000, [{ id: "a", name: "a", cents: 600 }])).toEqual({ assignedCents: 600, leftCents: 400, balanced: false });
    expect(zeroBased(1000, [{ id: "a", name: "a", cents: 1100 }]).leftCents).toBe(-100);
    expect(zeroBased(1000, [{ id: "a", name: "a", cents: 1000 }]).balanced).toBe(true);
  });
});

describe("rollover", () => {
  it("carries unspent money and overspending", () => {
    expect(rollover(10000, 0, 7000)).toBe(3000);
    expect(rollover(10000, 3000, 14000)).toBe(-1000);
  });
});

describe("pace", () => {
  const d = new Date(2026, 10, 15); // 15 of 30 days: half way
  it("compares spending to an even spread", () => {
    expect(pace(4000, 10000, d)).toMatchObject({ status: "under", expectedCents: 5000 });
    expect(pace(6000, 10000, d).status).toBe("over");
    expect(pace(5000, 10000, d).status).toBe("under"); // exactly on pace
  });
  it("handles a zero budget", () => {
    expect(pace(0, 0, d).status).toBe("under");
    expect(pace(1, 0, d).status).toBe("over");
  });
});
