import { describe, expect, it } from "vitest";
import { windowClass } from "./windowClass";
import { backAction } from "./backButton";
import { notificationId, planNotifications } from "./reminderSchedule";

describe("window classes", () => {
  it("splits at 600 and 840 px", () => {
    expect([344, 360, 412, 599].map(windowClass)).toEqual(Array(4).fill("compact"));
    expect([600, 673, 840].map(windowClass)).toEqual(Array(3).fill("medium"));
    expect([841, 1280].map(windowClass)).toEqual(["expanded", "expanded"]);
  });
});

describe("back button", () => {
  const closed = { dialogOpen: false, assistantOpen: false, dayOpen: false, readerOpen: false, page: "tasks" };
  it("closes the most specific thing first", () => {
    expect(backAction({ ...closed, dialogOpen: true, dayOpen: true })).toBe("close-dialog");
    expect(backAction({ ...closed, assistantOpen: true, dayOpen: true })).toBe("close-assistant");
    expect(backAction({ ...closed, dayOpen: true })).toBe("close-day");
    expect(backAction({ ...closed, readerOpen: true })).toBe("close-reader");
    expect(backAction(closed)).toBe("go-home");
  });
  it("leaves the app from Home with nothing open", () => {
    expect(backAction({ ...closed, page: "home" })).toBeNull();
  });
});

describe("scheduled reminders", () => {
  const now = new Date("2026-11-26T09:00:00");
  const at = (h: number) => new Date(now.getTime() + h * 36e5);
  it("keeps future reminders in order and drops past, far and duplicate ones", () => {
    const plan = planNotifications(
      [
        { key: "a", title: "Later", detail: "", at: at(5) },
        { key: "b", title: "Soon", detail: "", at: at(1) },
        { key: "old", title: "Past", detail: "", at: at(-1) },
        { key: "far", title: "Next month", detail: "", at: at(24 * 30) },
        { key: "a", title: "Duplicate", detail: "", at: at(5) },
      ],
      now,
    );
    expect(plan.map((p) => p.title)).toEqual(["Soon", "Later"]);
  });
  it("caps the list and gives stable positive ids", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ key: `k${i}`, title: "x", detail: "", at: at(1 + i / 100) }));
    expect(planNotifications(many, now)).toHaveLength(50);
    expect(notificationId("k1")).toBe(notificationId("k1"));
    expect(notificationId("k1")).toBeGreaterThan(0);
  });
});
