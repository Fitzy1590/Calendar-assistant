import { describe, expect, it } from "vitest";
import { taskBoardEvents } from "./planner";

describe("Tasks page events", () => {
  it("never include sports fixtures, and keep everything else", () => {
    const evs = [
      { id: "1", source: "sports" as const },
      { id: "2", source: "manual" as const },
      { id: "3" },
      { id: "4", source: "email" as const },
    ];
    expect(taskBoardEvents(evs).map((e) => e.id)).toEqual(["2", "3", "4"]);
  });
});
