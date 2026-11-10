import { describe, expect, it } from "vitest";
import { moveTo, nudge } from "./order";

const L = (...ids: string[]) => ids.map((id) => ({ id, visible: true }));
const ids = (l: { id: string }[]) => l.map((x) => x.id).join("");

describe("reordering", () => {
  it("dragging down puts the item after the target, up puts it before", () => {
    expect(ids(moveTo(L("a", "b", "c", "d"), "a", "c"))).toBe("bcad");
    expect(ids(moveTo(L("a", "b", "c", "d"), "d", "b"))).toBe("adbc");
  });
  it("does nothing for the same item or an unknown one, and doesn't change the original", () => {
    const l = L("a", "b");
    expect(moveTo(l, "a", "a")).toBe(l);
    expect(moveTo(l, "x", "a")).toBe(l);
    moveTo(l, "a", "b");
    expect(ids(l)).toBe("ab");
  });
  it("nudges one step among the visible items, skipping hidden ones", () => {
    const l = [
      { id: "a", visible: true },
      { id: "h", visible: false },
      { id: "b", visible: true },
      { id: "c", visible: true },
    ];
    expect(ids(nudge(l, "b", -1, (x) => x.visible))).toBe("bahc");
    expect(ids(nudge(l, "a", -1, (x) => x.visible))).toBe("ahbc"); // already first
    expect(ids(nudge(l, "c", 1, (x) => x.visible))).toBe("ahbc"); // already last
  });
});
