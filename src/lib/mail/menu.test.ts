import { describe, expect, it } from "vitest";
import { dropMenu, menuOrder, MENU_ITEMS, nudgeMenu, toggleMenuItem, visibleMenu } from "./menu";

const empty = { order: [] as string[], hidden: [] as string[] };

describe("right-click menu order", () => {
  it("starts with the standard order, and a saved order wins", () => {
    expect(menuOrder(empty)).toEqual(MENU_ITEMS.map((i) => i.id));
    expect(menuOrder({ order: ["forward", "reply"], hidden: [] }).slice(0, 3)).toEqual(["forward", "reply", "replyAll"]);
  });
  it("adds new items at the end and drops ones that no longer exist", () => {
    const o = menuOrder({ order: ["reply", "gone", "reply"], hidden: [] });
    expect(o).not.toContain("gone");
    expect(o.filter((x) => x === "reply")).toHaveLength(1);
    expect(o).toHaveLength(MENU_ITEMS.length);
  });
  it("moves up and down by one, stopping at the ends", () => {
    expect(nudgeMenu(empty, "forward", -1).order.slice(0, 3)).toEqual(["reply", "forward", "replyAll"]);
    expect(nudgeMenu(empty, "reply", -1).order[0]).toBe("reply");
    const last = MENU_ITEMS[MENU_ITEMS.length - 1].id;
    expect(nudgeMenu(empty, last, 1).order[MENU_ITEMS.length - 1]).toBe(last);
  });
  it("drags an item onto another", () => {
    expect(dropMenu(empty, "reply", "replyAll").order.slice(0, 3)).toEqual(["replyAll", "reply", "forward"]);
    expect(dropMenu(empty, "gemini", "reply").order[0]).toBe("gemini");
  });
  it("hides and shows items without losing their place", () => {
    const hidden = toggleMenuItem(empty, "claude");
    expect(visibleMenu(hidden).some((i) => i.id === "claude")).toBe(false);
    expect(menuOrder(hidden)).toContain("claude");
    expect(visibleMenu(toggleMenuItem(hidden, "claude")).some((i) => i.id === "claude")).toBe(true);
  });
});
