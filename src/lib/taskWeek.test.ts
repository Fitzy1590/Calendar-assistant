import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { isUnassigned, nextDays, tasksToRelease, weekStartYmd, workDay } from "./taskWeek";

const t = (id: string, o: Partial<Task> = {}): Task =>
  ({ id, title: id, done: false, priority: "med", updatedAt: 0, deleted: false, ...o }) as Task;

describe("task weeks", () => {
  it("finds the week start for Monday and Sunday weeks", () => {
    expect(weekStartYmd("2026-11-12", 1)).toBe("2026-11-09");
    expect(weekStartYmd("2026-11-12", 0)).toBe("2026-11-08");
  });
  it("unassigned = open, not deleted, no day", () => {
    expect(isUnassigned(t("a"))).toBe(true);
    expect(isUnassigned(t("b", { due: "2026-11-12" }))).toBe(false);
    expect(isUnassigned(t("c", { done: true }))).toBe(false);
    expect(isUnassigned(t("d", { deleted: true }))).toBe(false);
  });
  it("a planned day wins over the deadline, and can be weeks earlier", () => {
    expect(workDay(t("a", { due: "2026-12-14", plannedFor: "2026-11-16" }))).toBe("2026-11-16");
    expect(workDay(t("b", { due: "2026-12-14" }))).toBe("2026-12-14");
    expect(isUnassigned(t("c", { plannedFor: "2026-11-16" }))).toBe(false);
  });
  it("releases only open, unparked tasks planned for earlier weeks, keeping the deadline", () => {
    const list = [
      t("old", { plannedFor: "2026-11-05", due: "2026-12-14" }),
      t("thisWeek", { plannedFor: "2026-11-09" }),
      t("future", { plannedFor: "2026-11-20", due: "2026-12-14" }),
      t("dueOnly", { due: "2026-11-01" }),
      t("done", { plannedFor: "2026-11-01", done: true }),
      t("parked", { plannedFor: "2026-11-01", ignored: true }),
      t("none"),
    ];
    expect(tasksToRelease(list, "2026-11-12", 1).map((x) => x.id)).toEqual(["old"]);
  });
  it("lists seven days from today", () => {
    expect(nextDays("2026-11-12")).toHaveLength(7);
    expect(nextDays("2026-11-28")[3]).toBe("2026-12-01");
  });
});
