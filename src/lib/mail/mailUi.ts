import { groupLabel } from "../shoppingHistory";
import type { MailMessage } from "./types";

/** Small pure helpers for the email list: avatars, search and date groups. */

/** "Sam Rivera" → "SR", "energyco" → "EN", an address with no name → its first two letters. */
export function initials(name: string | undefined, address: string): string {
  const words = (name ?? "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  const one = words[0] ?? address.split("@")[0].replace(/[^\p{L}\p{N}]/gu, "");
  return one.slice(0, 2).toUpperCase() || "?";
}

/** One of four steady tints for a sender, always the same for the same address. */
export function tone(address: string): 0 | 1 | 2 | 3 {
  let h = 0;
  for (const ch of address.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 4) as 0 | 1 | 2 | 3;
}

/** Every word you type must be somewhere in the sender, subject or text. */
export function searchMail(rows: MailMessage[], query: string): MailMessage[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((m) => {
    const hay = `${m.from.name ?? ""} ${m.from.address} ${m.subject} ${m.preview} ${m.text ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export type MailGroup = { label: "Today" | "Yesterday" | "This week" | "Earlier"; rows: MailMessage[] };

/** Newest first, under Today / Yesterday / This week / Earlier. */
export function groupRows(rows: MailMessage[], now = Date.now()): MailGroup[] {
  const sorted = [...rows].sort((a, b) => b.receivedAt - a.receivedAt);
  const out: MailGroup[] = [];
  for (const m of sorted) {
    const label = groupLabel(m.receivedAt, now);
    const last = out[out.length - 1];
    if (last?.label === label) last.rows.push(m);
    else out.push({ label, rows: [m] });
  }
  return out;
}
