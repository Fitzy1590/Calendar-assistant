import type { Txn } from "../bankStatement";
import { merchantKey } from "../subscriptions";
import type { Cents, TxnRow } from "./types";

/** Statement lines -> vault rows. Pure. */

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
};

/** Stable ids so importing the same file twice adds nothing; identical lines in one file get a counter. */
export function toRows(txns: Txn[]): TxnRow[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const cents = Math.round(t.amount * 100);
    const base = `${t.date}|${cents}|${t.description}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { id: `t-${fnv(base)}-${n}`, date: t.date, cents, desc: t.description };
  });
}

/** Money spent this month per envelope (positive cents), from the lines assigned to it. */
export function spentByEnvelope(rows: TxnRow[], month: string): Map<string, Cents> {
  const out = new Map<string, Cents>();
  for (const r of rows) {
    if (!r.envelopeId || r.cents >= 0 || !r.date.startsWith(month)) continue;
    out.set(r.envelopeId, (out.get(r.envelopeId) ?? 0) - r.cents);
  }
  return out;
}

export interface Merchant {
  key: string;
  label: string;
  totalCents: Cents; // positive: money out
  count: number;
  ids: string[];
}

/** Unsorted spending lines grouped by merchant, biggest first. */
export function unsortedMerchants(rows: TxnRow[]): Merchant[] {
  const m = new Map<string, Merchant>();
  for (const r of rows) {
    if (r.envelopeId || r.cents >= 0) continue;
    const key = merchantKey(r.desc);
    const cur = m.get(key) ?? { key, label: r.desc, totalCents: 0, count: 0, ids: [] };
    cur.totalCents -= r.cents;
    cur.count++;
    cur.ids.push(r.id);
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.totalCents - a.totalCents);
}
