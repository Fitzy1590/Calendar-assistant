import type Anthropic from "@anthropic-ai/sdk";
import type { PricePoint, ShoppingItem } from "../types";
import { live, useStore } from "../store";
import { getJson, httpGet } from "./http";
import { isTauri } from "./platform";

/* ------------------------------------------------------------------ location */

export interface Here {
  lat: number;
  lon: number;
  label: string;
  precise: boolean;
}

/** Current position when the device allows it, otherwise your home suburb from Settings. */
export async function whereAmI(): Promise<Here> {
  const home = useStore.getState().settings.location;
  try {
    const pos = await new Promise<GeolocationPosition>((ok, err) =>
      navigator.geolocation.getCurrentPosition(ok, err, { timeout: 8000, maximumAge: 5 * 60e3, enableHighAccuracy: false }),
    );
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, label: "your current location", precise: true };
  } catch {
    if (home) return { lat: home.lat, lon: home.lon, label: home.name, precise: false };
    throw new Error("Couldn't get your location. Allow location access, or set your suburb in Settings.");
  }
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------------------------------------------ nearby stores (OpenStreetMap) */

export interface Store {
  id: string;
  name: string;
  brand?: string;
  kind: string;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  hours?: string;
  website?: string;
  phone?: string;
}

/** What kinds of shop sell a product, as OpenStreetMap shop tags. */
const CATEGORIES: [RegExp, string[]][] = [
  [
    /paint|primer|brush|roller|drill|screw|nail|timber|tool|hardware|glue|sandpaper|tile|plumb|light ?bulb|hinge|bolt/i,
    ["doityourself", "hardware", "paint", "trade", "building_materials"],
  ],
  [
    /milk|bread|egg|fruit|veg|grocer|meat|chicken|cheese|coffee|tea|cereal|snack|drink|nappies|toilet paper/i,
    ["supermarket", "convenience", "greengrocer", "butcher", "bakery"],
  ],
  [
    /laptop|phone|charger|cable|tv|headphone|computer|monitor|keyboard|mouse|camera|console|usb|hdmi|battery/i,
    ["electronics", "computer", "mobile_phone", "department_store"],
  ],
  [/paper|pen|printer|ink|toner|stationery|folder|notebook|office|desk|chair/i, ["stationery", "office_supplies", "department_store"]],
  [/medicine|panadol|vitamin|pharmac|bandaid|sunscreen|chemist/i, ["chemist", "pharmacy"]],
  [/shirt|pants|jeans|dress|shoe|sneaker|jacket|clothes|socks/i, ["clothes", "shoes", "department_store"]],
  [
    /sofa|couch|bed|mattress|table|shelf|lamp|rug|furniture|cushion/i,
    ["furniture", "houseware", "interior_decoration", "department_store"],
  ],
  [/plant|soil|seed|garden|mulch|fertili[sz]er|pot/i, ["garden_centre", "doityourself", "florist"]],
  [/book|novel/i, ["books"]],
  [/toy|lego|game/i, ["toys", "games", "department_store"]],
  [/dog|cat|pet/i, ["pet"]],
  [/car|oil|tyre|wiper|battery/i, ["car_parts", "car_repair", "tyres"]],
];
const DEFAULT_KINDS = ["department_store", "variety_store", "supermarket", "doityourself", "general"];

export function kindsFor(product: string) {
  const kinds = new Set<string>();
  for (const [re, k] of CATEGORIES) if (re.test(product)) k.forEach((x) => kinds.add(x));
  return kinds.size ? [...kinds] : DEFAULT_KINDS;
}

export async function findStores(product: string, here: Here, radiusKm: number): Promise<Store[]> {
  const kinds = kindsFor(product);
  const r = Math.round(Math.min(Math.max(radiusKm, 1), 40) * 1000);
  const q =
    `[out:json][timeout:20];(` +
    `nwr["shop"~"^(${kinds.join("|")})$"](around:${r},${here.lat},${here.lon});` +
    (kinds.includes("pharmacy") ? `nwr["amenity"="pharmacy"](around:${r},${here.lat},${here.lon});` : "") +
    `);out center tags 120;`;
  const j = await getJson<{ elements: any[] }>(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
  const seen = new Set<string>();
  return j.elements
    .map((e) => {
      const t = e.tags ?? {};
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (!t.name || lat == null) return null;
      const address = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:suburb"] || t["addr:city"]]
        .filter(Boolean)
        .join(", ");
      return {
        id: `${e.type}/${e.id}`,
        name: t.name,
        brand: t.brand,
        kind: (t.shop || t.amenity || "").replace(/_/g, " "),
        lat,
        lon,
        distanceKm: distanceKm(here, { lat, lon }),
        address: address || undefined,
        hours: t.opening_hours,
        website: t.website || t["contact:website"] || t["brand:website"],
        phone: t.phone || t["contact:phone"],
      } as Store;
    })
    .filter((s): s is Store => !!s)
    .filter((s) => !seen.has(s.name + Math.round(s.distanceKm * 10)) && seen.add(s.name + Math.round(s.distanceKm * 10)))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 30);
}

/* ------------------------------------------------------------------ maps & retailer links */

/** Opens Google Maps with directions; on Android this launches the Maps app and starts navigating. */
export function navigateUrl(
  dest: { lat?: number; lon?: number; name?: string; address?: string },
  mode: "driving" | "walking" | "transit" = "driving",
) {
  const destination = dest.lat != null ? `${dest.lat},${dest.lon}` : [dest.name, dest.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${mode}&dir_action=navigate`;
}
export const mapsSearchUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

export const RETAILERS: Record<string, (q: string) => string> = {
  "Google Shopping": (q) => `https://www.google.com/search?tbm=shop&gl=au&q=${encodeURIComponent(q)}`,
  "Amazon AU": (q) => `https://www.amazon.com.au/s?k=${encodeURIComponent(q)}`,
  Officeworks: (q) => `https://www.officeworks.com.au/shop/officeworks/search?q=${encodeURIComponent(q)}`,
  Bunnings: (q) => `https://www.bunnings.com.au/search/products?q=${encodeURIComponent(q)}`,
  "eBay AU": (q) => `https://www.ebay.com.au/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  "JB Hi-Fi": (q) => `https://www.jbhifi.com.au/search?query=${encodeURIComponent(q)}`,
  Kmart: (q) => `https://www.kmart.com.au/search/?searchTerm=${encodeURIComponent(q)}`,
  "Big W": (q) => `https://www.bigw.com.au/search?text=${encodeURIComponent(q)}`,
  Woolworths: (q) => `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(q)}`,
  Coles: (q) => `https://www.coles.com.au/search/products?q=${encodeURIComponent(q)}`,
};

/* ------------------------------------------------------------------ live prices (Claude + web search) */

export interface PriceHit {
  retailer: string;
  product: string;
  price: number;
  currency: string;
  url: string;
  where: "store" | "online" | "both";
  note?: string;
}

export const pricesAvailable = () => {
  const a = useStore.getState().settings.assistant;
  return a.provider === "claude" && !!a.apiKey;
};

/**
 * Ask Claude to look up current prices on retailers' websites. Results are only what the pages show
 * today; each comes with its source link so you can check before buying.
 */
export async function comparePrices(product: string, stores: Store[], here: Here): Promise<PriceHit[]> {
  const s = useStore.getState().settings;
  if (!pricesAvailable()) throw new Error("Live price comparison uses Claude: turn it on in Settings → Assistant & voice.");
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  const client = new AnthropicSDK({ apiKey: s.assistant.apiKey, dangerouslyAllowBrowser: true });
  const nearby = [...new Set(stores.slice(0, 8).map((x) => x.brand || x.name))].join(", ") || "none found";
  const prompt =
    `Find the current price of "${product}" in Australia (AUD).\n` +
    `Nearby physical stores (near ${here.label}): ${nearby}.\n` +
    `Online stores to compare: ${s.shopping.onlineStores.join(", ")}.\n` +
    `Search the retailers' own websites. Only report prices you actually saw on a product page, with that page's URL. ` +
    `Prefer the closest match to what was asked; note size/quantity differences in "note".\n` +
    `Reply with only a JSON array, cheapest first, no prose: ` +
    `[{"retailer": string, "product": string, "price": number, "currency": "AUD", "url": string, "where": "store"|"online"|"both", "note": string}]`;
  const res = (await client.beta.messages.create({
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    model: "claude-opus-5-5",
    max_tokens: 6000,
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "AU" } }],
    messages: [{ role: "user", content: prompt }],
  } as never)) as unknown as Anthropic.Message;
  if (res.stop_reason === "refusal") throw new Error("Claude couldn't search for that.");
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parsePriceJson(text);
}

export function parsePriceJson(text: string): PriceHit[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as any[];
    return arr
      .filter((x) => x && typeof x.price === "number" && x.price > 0 && /^https?:\/\//.test(x.url ?? ""))
      .map((x) => ({
        retailer: String(x.retailer ?? "").slice(0, 60),
        product: String(x.product ?? "").slice(0, 160),
        price: Math.round(x.price * 100) / 100,
        currency: String(x.currency ?? "AUD").slice(0, 3),
        url: x.url,
        where: (["store", "online", "both"].includes(x.where) ? x.where : "online") as PriceHit["where"],
        note: x.note ? String(x.note).slice(0, 160) : undefined,
      }))
      .sort((a, b) => a.price - b.price);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ price tracking */

/**
 * Read a product page's price from the structured data shops publish for search engines
 * (schema.org JSON-LD offers, product:price meta tags, itemprop="price").
 */
export function extractPrice(html: string): { price: number; currency: string } | null {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findOffer(JSON.parse(m[1].trim()));
      if (found) return found;
    } catch {
      /* malformed JSON-LD: try the next block */
    }
  }
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${prop}["']`, "i"))?.[1];
  const amount = meta("product:price:amount") ?? meta("og:price:amount") ?? meta("price");
  if (amount && !isNaN(parseFloat(amount)))
    return {
      price: parseFloat(amount),
      currency: meta("product:price:currency") ?? meta("og:price:currency") ?? meta("priceCurrency") ?? "AUD",
    };
  const ip = html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i)?.[1];
  if (ip) return { price: parseFloat(ip.replace(/,/g, "")), currency: "AUD" };
  return null;
}

function findOffer(node: any): { price: number; currency: string } | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findOffer(n);
      if (f) return f;
    }
    return null;
  }
  const price = node.price ?? node.lowPrice ?? node.priceSpecification?.price;
  if ((node["@type"] === "Offer" || node["@type"] === "AggregateOffer" || node.priceCurrency) && price != null && !isNaN(parseFloat(price)))
    return { price: parseFloat(price), currency: node.priceCurrency ?? node.priceSpecification?.priceCurrency ?? "AUD" };
  for (const k of ["offers", "@graph", "mainEntity", "itemOffered"]) {
    const f = findOffer(node[k]);
    if (f) return f;
  }
  return null;
}

async function fetchPage(url: string): Promise<string> {
  if (isTauri()) {
    const r = await httpGet(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CalendarAssistant/0.1", Accept: "text/html" },
    });
    return r.text();
  }
  // browser build: the sync server fetches it (only for paired devices, public addresses only)
  const { serverUrl, pairingCode } = useStore.getState().settings.sync;
  if (!serverUrl) throw new Error("Price checks in the browser need the sync server; the Windows and Android apps check directly.");
  const base = serverUrl.replace(/^ws/, "http").replace(/\/$/, "");
  const r = await fetch(`${base}/fetch-page?url=${encodeURIComponent(url)}`, { headers: { "X-Pairing-Code": pairingCode } });
  if (!r.ok) throw new Error(`Couldn't open the page (${r.status})`);
  return r.text();
}

export async function checkPrice(item: ShoppingItem): Promise<PricePoint> {
  if (!item.track?.url) throw new Error("No product link to check.");
  const html = await fetchPage(item.track.url);
  const p = extractPrice(html);
  if (!p) throw new Error("This shop's page doesn't publish its price in a readable way. Try another retailer's link.");
  return { at: Date.now(), price: p.price, currency: p.currency };
}

export interface Trend {
  current?: number;
  previous?: number;
  first?: number;
  lowest?: number;
  highest?: number;
  changeFromPrev?: number;
  changeFromFirst?: number;
}

export function trend(history: PricePoint[]): Trend {
  if (!history.length) return {};
  const prices = history.map((h) => h.price);
  const current = prices[prices.length - 1];
  // previous = the last price that differs from the current one
  const previous = [...prices].reverse().find((p) => p !== current);
  return {
    current,
    previous,
    first: prices[0],
    lowest: Math.min(...prices),
    highest: Math.max(...prices),
    changeFromPrev: previous != null ? +(current - previous).toFixed(2) : 0,
    changeFromFirst: +(current - prices[0]).toFixed(2),
  };
}

/** Check every tracked item (at most once every 20 hours each). Returns notices for drops. */
export async function checkTrackedPrices(force = false): Promise<string[]> {
  const st = useStore.getState();
  const notices: string[] = [];
  for (const item of live(st.shopping)) {
    if (!item.track || item.done) continue;
    if (!force && Date.now() - (item.track.lastChecked ?? 0) < 20 * 3600e3) continue;
    try {
      const point = await checkPrice(item);
      const before = trend(item.track.history).current;
      const history = [...item.track.history, point].slice(-180);
      useStore
        .getState()
        .upsert("shopping", {
          id: item.id,
          price: point.price,
          currency: point.currency,
          track: { ...item.track, history, lastChecked: Date.now(), lastError: undefined },
        });
      if (before != null && point.price < before)
        notices.push(`${item.name} dropped to $${point.price.toFixed(2)} (was $${before.toFixed(2)})`);
      else if (item.track.targetPrice && point.price <= item.track.targetPrice)
        notices.push(`${item.name} is $${point.price.toFixed(2)}, at or under your target`);
    } catch (e) {
      useStore
        .getState()
        .upsert("shopping", { id: item.id, track: { ...item.track, lastChecked: Date.now(), lastError: (e as Error).message } });
    }
  }
  return notices;
}

export function addToList(p: Partial<ShoppingItem> & { name: string }): ShoppingItem {
  const all = live(useStore.getState().shopping);
  const order = all.length ? Math.min(...all.map((x) => x.order)) - 1 : 0;
  return useStore.getState().upsert("shopping", { done: false, order, ...p });
}
