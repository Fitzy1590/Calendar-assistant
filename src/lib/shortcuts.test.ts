import { describe, expect, it } from "vitest";
import { isTyping, pageForKey, shortcutLabel } from "./shortcuts";

const menu = (
  ["home", "calendar", "email", "tasks", "notes", "shopping", "reminders", "contacts", "news", "sports", "settings"] as const
).map((id) => ({ id }));

describe("shortcuts", () => {
  it("numbers the first ten menu items 1-9 then 0", () => {
    expect([0, 1, 8, 9, 10, -1].map(shortcutLabel)).toEqual(["1", "2", "9", "0", "", ""]);
  });
  it("opens the page at that position, following the order you set", () => {
    expect(pageForKey("1", menu)).toBe("home");
    expect(pageForKey("4", menu)).toBe("tasks");
    expect(pageForKey("0", menu)).toBe("sports");
    const reordered = [menu[4], ...menu.filter((m) => m.id !== "notes")];
    expect(pageForKey("1", reordered)).toBe("notes");
    expect(pageForKey("9", menu.slice(0, 3))).toBeUndefined();
    expect(pageForKey("a", menu)).toBeUndefined();
    expect(pageForKey("10", menu)).toBeUndefined();
  });
  it("leaves keys alone while typing", () => {
    expect(isTyping({ tagName: "INPUT" })).toBe(true);
    expect(isTyping({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTyping({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTyping({ tagName: "DIV", getAttribute: () => "textbox" })).toBe(true);
    expect(isTyping({ tagName: "BUTTON" })).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
