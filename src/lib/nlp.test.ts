import { describe, expect, it } from "vitest";
import { cleanTitle, parseRecurrence, parseWhen } from "./nlp";

const now = new Date(2026, 10, 7, 10, 0); // Sat 7 Nov 2026 10:00

describe("parseWhen", () => {
  it("reads tomorrow at 3pm", () => {
    const w = parseWhen("dentist tomorrow at 3pm", now);
    expect(w.date?.getDate()).toBe(8);
    expect(w.hour).toBe(15);
    expect(w.rest).toBe("dentist");
  });
  it("reads weekday names as the upcoming day", () => {
    const w = parseWhen("lunch with sam friday 12:30", now);
    expect(w.date?.getDay()).toBe(5);
    expect(w.date?.getDate()).toBe(13);
    expect(w.hour).toBe(12);
    expect(w.minute).toBe(30);
  });
  it("reads day-month dates and rolls past dates into next year", () => {
    const w = parseWhen("party on 12 March", now);
    expect(w.date?.getFullYear()).toBe(2027);
    expect(w.date?.getMonth()).toBe(2);
  });
  it("reads durations without mistaking them for times", () => {
    const w = parseWhen("gym at 6am for 90 min", now);
    expect(w.hour).toBe(6);
    expect(w.durationMins).toBe(90);
  });
  it("reads week ranges", () => {
    const w = parseWhen("what's on next week", now);
    expect(w.range?.from.getDay()).toBe(1);
  });
});

describe("parseRecurrence", () => {
  it("reads every monday and wednesday", () => {
    const r = parseRecurrence("soccer every monday and wednesday at 6pm");
    expect(r.recurrence).toEqual({ freq: "weekly", interval: 1, byWeekday: [1, 3] });
  });
  it("reads every 2 weeks", () => {
    expect(parseRecurrence("bins every 2 weeks").recurrence).toEqual({ freq: "weekly", interval: 2 });
  });
  it("reads fortnightly", () => {
    expect(parseRecurrence("pay day fortnightly").recurrence?.interval).toBe(2);
  });
});

describe("cleanTitle", () => {
  it("strips command words", () => {
    expect(cleanTitle("add a dentist appointment")).toBe("Dentist appointment");
    expect(cleanTitle("remind me to buy milk")).toBe("Buy milk");
  });
});

describe("relative words", () => {
  it("reads yesterday", () => {
    expect(parseWhen("pay rates yesterday", now).date?.getDate()).toBe(6);
  });
});

import { toggleLine, tagsOf } from "./notes";
describe("notes helpers", () => {
  it("toggles checklist lines", () => {
    expect(toggleLine("Shop\n[ ] milk\n[x] eggs", 1)).toBe("Shop\n[x] milk\n[x] eggs");
    expect(toggleLine("- [x] bread", 0)).toBe("- [ ] bread");
  });
  it("collects #tags", () => {
    expect(tagsOf({ title: "Trip", body: "Pack #holiday and #Kids stuff" })).toEqual(["holiday", "kids"]);
  });
});
