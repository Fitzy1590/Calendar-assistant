/** A short record of what you searched for on the Shopping page, newest first. Pure. */

export interface SearchRecord {
  term: string;
  at: number;
  stores: number; // nearby shops found
  best?: { retailer: string; price: number; currency: string }; // the cheapest price found, when prices were compared
}

export const MAX_HISTORY = 100;

/** Add a search. The same words (any capitals) replace the older entry and move to the top. */
export function addSearch(list: SearchRecord[], rec: SearchRecord): SearchRecord[] {
  const term = rec.term.trim();
  if (!term) return list;
  const key = term.toLowerCase();
  return [{ ...rec, term }, ...list.filter((r) => r.term.toLowerCase() !== key)].slice(0, MAX_HISTORY);
}

export const removeSearch = (list: SearchRecord[], term: string) => list.filter((r) => r.term !== term);

/** The cheapest hit with a real price. */
export function cheapest(hits: { retailer: string; price: number; currency: string }[]): SearchRecord["best"] {
  const priced = hits.filter((h) => Number.isFinite(h.price) && h.price > 0);
  if (!priced.length) return undefined;
  const h = priced.reduce((a, b) => (b.price < a.price ? b : a));
  return { retailer: h.retailer, price: h.price, currency: h.currency };
}

/** Group for the list: Today, Yesterday, This week, Earlier. */
export function groupLabel(at: number, now = Date.now()): "Today" | "Yesterday" | "This week" | "Earlier" {
  const start = new Date(now).setHours(0, 0, 0, 0);
  if (at >= start) return "Today";
  if (at >= start - 86400e3) return "Yesterday";
  if (at >= start - 6 * 86400e3) return "This week";
  return "Earlier";
}
