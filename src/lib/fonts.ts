/** App-wide font choice. One family drives body text, headings and numbers so every page matches. Pure: no DOM, no store. */

export type FontChoice = "plex" | "inter" | "outfit" | "atkinson" | "system" | "theme";

const FALLBACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const FONT_OPTIONS: { id: FontChoice; name: string; note: string; stack: string | null }[] = [
  { id: "plex", name: "IBM Plex Sans", note: "Standard: calm and clear", stack: `"IBM Plex Sans", ${FALLBACK}` },
  { id: "inter", name: "Inter", note: "Crisp and neutral", stack: `"Inter", ${FALLBACK}` },
  { id: "outfit", name: "Outfit", note: "Rounded, geometric", stack: `"Outfit", "Inter", ${FALLBACK}` },
  { id: "atkinson", name: "Atkinson Hyperlegible", note: "Easiest to tell letters apart", stack: `"Atkinson Hyperlegible", ${FALLBACK}` },
  {
    id: "system",
    name: "Windows system font",
    note: "Segoe UI, nothing to download",
    stack: `"Segoe UI Variable Text", "Segoe UI", ${FALLBACK}`,
  },
  { id: "theme", name: "Match theme", note: "Each theme's own fonts", stack: null },
];

export const DEFAULT_FONT: FontChoice = "plex";

/** The stack for a choice, or null when the theme's own fonts should apply. Unknown ids fall back to the default. */
export function fontStack(id: string): string | null {
  const o = FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS.find((f) => f.id === DEFAULT_FONT)!;
  return o.stack;
}
