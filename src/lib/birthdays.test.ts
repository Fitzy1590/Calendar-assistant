import { describe, expect, it } from "vitest";
import { birthdayEvent } from "./birthdays";
import { occurrences } from "./recurrence";

describe("birthday events", () => {
  it("repeat every year far ahead", () => {
    const ev = birthdayEvent({ id: "c1", updatedAt: 0, name: "Luke", birthday: "1992-11-12" })!;
    const occ = occurrences(ev, new Date(2027, 0, 1), new Date(2030, 0, 1));
    expect(occ.map((o) => o.start.getFullYear())).toEqual([2027, 2028, 2029]);
    expect(occ[0].start.getMonth()).toBe(10);
  });
  it("handle unknown birth year and 29 Feb", () => {
    const ev = birthdayEvent({ id: "c2", updatedAt: 0, name: "Sam", birthday: "1900-02-29" })!;
    const occ = occurrences(ev, new Date(2027, 0, 1), new Date(2033, 0, 1));
    expect(occ.map((o) => o.start.getFullYear())).toEqual([2028, 2032]);
  });
});
