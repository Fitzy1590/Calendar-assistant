import { describe, expect, it } from "vitest";
import { homeSummary } from "./homeSummary";

describe("homeSummary", () => {
  it("lists what is on today", () => {
    expect(homeSummary({ events: 3, tasks: 3, bills: 1, billDays: 9 })).toBe("3 events today · 3 tasks due · 1 bill due in 9 days");
  });
  it("uses singular words and skips empty parts", () => {
    expect(homeSummary({ events: 1, tasks: 0, bills: 0 })).toBe("1 event today");
    expect(homeSummary({ events: 0, tasks: 1, bills: 0 })).toBe("1 task due");
  });
  it("describes bills by how soon they are due", () => {
    expect(homeSummary({ events: 0, tasks: 0, bills: 1, billDays: 0 })).toBe("1 bill due today");
    expect(homeSummary({ events: 0, tasks: 0, bills: 1, billDays: 1 })).toBe("1 bill due tomorrow");
    expect(homeSummary({ events: 0, tasks: 0, bills: 2, billDays: 3 })).toBe("2 bills due, first in 3 days");
    expect(homeSummary({ events: 0, tasks: 0, bills: 2, billDays: -1 })).toBe("2 bills overdue");
    expect(homeSummary({ events: 0, tasks: 0, bills: 1 })).toBe("1 bill to pay");
  });
  it("says so when the day is clear", () => {
    expect(homeSummary({ events: 0, tasks: 0, bills: 0 })).toBe("Nothing on today.");
  });
});
