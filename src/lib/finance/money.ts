import type { Cents } from "./types";

/** "1,234.56" or "$12" -> whole cents with no float error. Returns null when it isn't a plain amount. */
export function parseCents(input: string): Cents | null {
  const m = /^\s*(-)?\$?\s*(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m || (m[2] === undefined && m[3] === undefined)) return null;
  const whole = Number((m[2] ?? "0").replace(/,/g, ""));
  const cents = whole * 100 + Number((m[3] ?? "").padEnd(2, "0") || 0);
  return Number.isSafeInteger(cents) ? (m[1] ? -cents : cents) : null;
}

/** 142000 -> "$1,420.00", -13899 -> "-$138.99". */
export function fmtCents(c: Cents): string {
  const abs = Math.abs(c);
  const d = Math.floor(abs / 100).toLocaleString("en-US");
  return `${c < 0 ? "-" : ""}$${d}.${String(abs % 100).padStart(2, "0")}`;
}
