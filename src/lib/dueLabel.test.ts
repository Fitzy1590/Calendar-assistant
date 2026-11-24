import { describe, expect, it } from "vitest";
import { dueLabel } from "./dueLabel";

const today = "2026-11-24"; // a Tuesday

describe("dueLabel", () => {
  it("uses plain words near today", () => {
    expect(dueLabel("2026-11-24", today)).toBe("today");
    expect(dueLabel("2026-11-25", today)).toBe("tomorrow");
    expect(dueLabel("2026-11-23", today)).toBe("yesterday");
    expect(dueLabel("2026-11-22", today)).toBe("2 days ago");
    expect(dueLabel("2026-10-24", today)).toBe("31 days ago");
  });
  it("names the weekday within the next week, then the date", () => {
    expect(dueLabel("2026-11-27", today)).toBe("Fri");
    expect(dueLabel("2026-11-30", today)).toBe("Mon");
    expect(dueLabel("2026-12-01", today)).toBe("1 Dec");
    expect(dueLabel("2027-01-05", today)).toBe("5 Jan 2027");
  });
  it("says so when there is no date", () => {
    expect(dueLabel(undefined, today)).toBe("No date");
  });
});
