/** Colour helpers for themes and the accent picker. Pure: no DOM, no store. */

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of "#rrggbb" (or "#rgb"). */
export function luminance(hex: string): number {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return 0;
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const INK_LIGHT = "#ffffff";
const INK_DARK = "#14130f";

/** Text colour that reads best on the given background (for buttons filled with the accent). */
export function readableOn(bg: string): string {
  return contrastRatio(INK_LIGHT, bg) >= contrastRatio(INK_DARK, bg) ? INK_LIGHT : INK_DARK;
}

/** The high-contrast theme ignores the accent setting and uses this (14:1 on black). */
export const CONTRAST_ACCENT = "#ffd24a";

const toHex = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");

/**
 * The accent colour as it should be when used as *text* on `bg`: the accent itself when it is readable (AA, 4.5:1),
 * otherwise lightened (on dark backgrounds) or darkened (on light ones) just enough. Fills still use the real accent.
 */
export function accentText(accent: string, bg: string, min = 4.5): string {
  if (contrastRatio(accent, bg) >= min) return accent;
  const h = accent.replace(/^#/, "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return accent;
  const target = luminance(bg) < 0.4 ? 255 : 0;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  for (let t = 0.05; t <= 1.001; t += 0.05) {
    const c = "#" + toHex(r + (target - r) * t) + toHex(g + (target - g) * t) + toHex(b + (target - b) * t);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return target ? "#ffffff" : "#000000";
}
