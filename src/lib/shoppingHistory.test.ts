import { describe, expect, it } from "vitest";
import { addSearch, cheapest, groupLabel, MAX_HISTORY, removeSearch, type SearchRecord } from "./shoppingHistory";

const r = (term: string, at = 1): SearchRecord => ({ term, at, stores: 3 });

describe("shopping search history", () => {
  it("puts the newest first and moves a repeated search to the top", () => {
    let l = addSearch([], r("drill", 1));
    l = addSearch(l, r("paint", 2));
    l = addSearch(l, r("DRILL", 3));
    expect(l.map((x) => x.term)).toEqual(["DRILL", "paint"]);
    expect(l[0].at).toBe(3);
  });
  it("ignores empty searches, caps the length and removes one", () => {
    expect(addSearch([], r("  "))).toEqual([]);
    let l: SearchRecord[] = [];
    for (let i = 0; i < MAX_HISTORY + 20; i++) l = addSearch(l, r("item " + i, i));
    expect(l).toHaveLength(MAX_HISTORY);
    expect(removeSearch([r("a"), r("b")], "a").map((x) => x.term)).toEqual(["b"]);
  });
  it("finds the cheapest real price", () => {
    expect(
      cheapest([
        { retailer: "A", price: 12, currency: "AUD" },
        { retailer: "B", price: 9.5, currency: "AUD" },
        { retailer: "C", price: 0, currency: "AUD" },
      ]),
    ).toEqual({ retailer: "B", price: 9.5, currency: "AUD" });
    expect(cheapest([])).toBeUndefined();
  });
  it("groups by day", () => {
    const now = new Date(2026, 10, 11, 15).getTime();
    expect(groupLabel(new Date(2026, 10, 11, 9).getTime(), now)).toBe("Today");
    expect(groupLabel(new Date(2026, 10, 10, 20).getTime(), now)).toBe("Yesterday");
    expect(groupLabel(new Date(2026, 10, 7).getTime(), now)).toBe("This week");
    expect(groupLabel(new Date(2026, 9, 1).getTime(), now)).toBe("Earlier");
  });
});
