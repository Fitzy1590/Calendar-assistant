import { describe, expect, it } from "vitest";
import { DEFAULT_FONT, FONT_OPTIONS, fontStack } from "./fonts";

describe("fonts", () => {
  it("every choice except 'theme' has a stack that ends in a generic fallback", () => {
    for (const f of FONT_OPTIONS) {
      if (f.id === "theme") expect(f.stack).toBeNull();
      else expect(f.stack, f.id).toMatch(/sans-serif$/);
    }
  });
  it("falls back to the default for unknown ids and 'theme' means no override", () => {
    expect(fontStack("nope")).toBe(fontStack(DEFAULT_FONT));
    expect(fontStack("theme")).toBeNull();
  });
  it("lists each id once", () => {
    const ids = FONT_OPTIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
