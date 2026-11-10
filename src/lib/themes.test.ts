import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accentText, contrastRatio, readableOn, CONTRAST_ACCENT } from "./themes";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const themes: Record<string, Record<string, string>> = {};
for (const m of css.matchAll(/:root\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
  themes[m[1]] = {
    ...themes[m[1]],
    ...Object.fromEntries([...m[2].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((x) => [x[1], x[2]])),
  };
}
const ACCENTS = ["#2f5d8a", "#4f6b3a", "#b4532a", "#b8860b", "#8a3a55", "#50606e", "#ffffff", "#000000", "#ffd24a"];

describe("theme tokens (read from styles.css)", () => {
  it("defines every theme", () => {
    expect(Object.keys(themes).sort()).toEqual(["contrast", "forest", "ink", "oled", "paper", "sand", "slate"]);
  });
  for (const [name, t] of Object.entries(themes)) {
    it(`${name}: text, muted and status colours are readable (AA; AAA for contrast)`, () => {
      const min = name === "contrast" ? 7 : 4.5;
      for (const bg of ["bg", "surface", "surface-2"]) expect(contrastRatio(t.text, t[bg]), `text on ${bg}`).toBeGreaterThanOrEqual(min);
      for (const bg of ["surface", "surface-2"]) expect(contrastRatio(t.muted, t[bg]), `muted on ${bg}`).toBeGreaterThanOrEqual(min);
      for (const c of ["ok", "warn", "bad"]) expect(contrastRatio(t[c], t.surface), c).toBeGreaterThanOrEqual(min);
    });
    it(`${name}: outlines are visible against the page`, () => {
      expect(contrastRatio(t["line-strong"], t.bg)).toBeGreaterThanOrEqual(name === "contrast" ? 7 : 1.3);
    });
  }
  it("oled is true black and contrast is black and white", () => {
    expect(themes.oled.bg).toBe("#000000");
    expect(themes.contrast.text).toBe("#ffffff");
  });
});

describe("accent as text", () => {
  it("is readable (4.5:1) on every theme's surface for the preset accents and extremes", () => {
    for (const [name, t] of Object.entries(themes))
      for (const a of ACCENTS) expect(contrastRatio(accentText(a, t.surface), t.surface), `${a} on ${name}`).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps the accent when it already reads well, and never moves a readable one", () => {
    expect(accentText("#2f5d8a", "#fbf9f4")).toBe("#2f5d8a");
    expect(accentText("#2f5d8a", "#16241c")).not.toBe("#2f5d8a");
  });
});

describe("accent helpers", () => {
  it("picks a readable text colour for any accent", () => {
    for (const a of ACCENTS) expect(contrastRatio(readableOn(a), a), a).toBeGreaterThanOrEqual(4.5);
  });
  it("the high-contrast accent has AAA contrast on black", () => {
    expect(contrastRatio(CONTRAST_ACCENT, "#000000")).toBeGreaterThanOrEqual(7);
  });
  it("ratios are 1 to 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});
