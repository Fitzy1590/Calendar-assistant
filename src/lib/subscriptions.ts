import type { Txn } from "./bankStatement";

/** Finds repeating charges in bank transactions and says how to cancel them. Local and pure: nothing is uploaded. */

export type Cadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
export type Via = "Apple" | "Google Play" | "PayPal";

export const CATEGORIES = [
  "Streaming",
  "Music & audio",
  "Software & cloud",
  "Gaming",
  "News & reading",
  "Fitness & health",
  "Shopping & delivery",
  "Phone & internet",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Subscription {
  id: string;
  name: string;
  category: Category;
  amount: number; // the latest charge, positive
  cadence: Cadence;
  monthly: number;
  yearly: number;
  lastDate: string;
  nextDate: string;
  count: number; // charges seen
  known: boolean; // a service the app recognises
  via?: Via; // billed through Apple, Google Play or PayPal
  priceChange?: { from: number; to: number };
  hidden?: boolean; // "not a subscription"
}

export interface KnownService {
  name: string;
  match: RegExp;
  category: Category;
  manage?: string; // the account page where it can be cancelled
  note?: string;
}

/** Services people commonly pay for. The links are the providers' own account pages; where one isn't listed we offer a search instead. */
export const KNOWN: KnownService[] = [
  { name: "Netflix", match: /netflix/i, category: "Streaming", manage: "https://www.netflix.com/cancelplan" },
  { name: "Disney+", match: /disney ?(plus|\+)/i, category: "Streaming", manage: "https://www.disneyplus.com/account/subscription" },
  { name: "Stan", match: /\bstan\b.*(au|pty|\.com)|stan\.com/i, category: "Streaming", manage: "https://www.stan.com.au/account" },
  { name: "Binge", match: /\bbinge\b/i, category: "Streaming" },
  { name: "Foxtel", match: /foxtel/i, category: "Streaming" },
  { name: "Kayo Sports", match: /kayo/i, category: "Streaming" },
  { name: "Paramount+", match: /paramount/i, category: "Streaming" },
  {
    name: "Amazon Prime",
    match: /amazon ?prime|prime video|primevideo/i,
    category: "Shopping & delivery",
    manage: "https://www.amazon.com.au/gp/primecentral",
  },
  {
    name: "YouTube Premium",
    match: /youtube ?(premium|music)|google ?\*? ?youtube/i,
    category: "Streaming",
    manage: "https://www.youtube.com/paid_memberships",
  },
  { name: "Spotify", match: /spotify/i, category: "Music & audio", manage: "https://www.spotify.com/account/subscription/" },
  { name: "Apple Music", match: /apple music/i, category: "Music & audio", manage: "https://apps.apple.com/account/subscriptions" },
  { name: "Audible", match: /audible/i, category: "Music & audio", manage: "https://www.audible.com.au/account/overview" },
  {
    name: "Microsoft 365",
    match: /microsoft ?(365|\*? ?office)|msbill|microsoft.*subscr/i,
    category: "Software & cloud",
    manage: "https://account.microsoft.com/services",
  },
  { name: "Xbox Game Pass", match: /xbox|game ?pass/i, category: "Gaming", manage: "https://account.microsoft.com/services" },
  { name: "Adobe", match: /adobe/i, category: "Software & cloud", manage: "https://account.adobe.com/plans" },
  { name: "Google One", match: /google ?\*? ?(one|storage)/i, category: "Software & cloud", manage: "https://one.google.com/settings" },
  { name: "iCloud", match: /icloud/i, category: "Software & cloud", manage: "https://apps.apple.com/account/subscriptions" },
  { name: "Dropbox", match: /dropbox/i, category: "Software & cloud", manage: "https://www.dropbox.com/account/plan" },
  { name: "ChatGPT", match: /openai|chatgpt/i, category: "Software & cloud" },
  { name: "Claude", match: /anthropic|claude\.ai/i, category: "Software & cloud", manage: "https://claude.ai/settings/billing" },
  { name: "GitHub", match: /github/i, category: "Software & cloud", manage: "https://github.com/settings/billing" },
  { name: "Canva", match: /canva/i, category: "Software & cloud" },
  { name: "PlayStation", match: /playstation|sony.*(psn|network)/i, category: "Gaming" },
  { name: "Nintendo", match: /nintendo/i, category: "Gaming" },
  { name: "New York Times", match: /nytimes|new york times/i, category: "News & reading" },
  {
    name: "Kindle Unlimited",
    match: /kindle unlimited/i,
    category: "News & reading",
    manage: "https://www.amazon.com.au/kindle-dbs/ku/ku-central",
  },
  { name: "Medium", match: /\bmedium\b.*(member|\.com)/i, category: "News & reading" },
  { name: "Anytime Fitness", match: /anytime fitness/i, category: "Fitness & health" },
  { name: "Strava", match: /strava/i, category: "Fitness & health" },
  { name: "Calm", match: /\bcalm\.com|calm app/i, category: "Fitness & health" },
  { name: "Uber One", match: /uber ?one/i, category: "Shopping & delivery" },
  { name: "DoorDash DashPass", match: /dashpass|doordash/i, category: "Shopping & delivery" },
  { name: "Menulog", match: /menulog/i, category: "Shopping & delivery" },
  { name: "Telstra", match: /telstra/i, category: "Phone & internet" },
  { name: "Optus", match: /optus/i, category: "Phone & internet" },
  { name: "Vodafone", match: /vodafone/i, category: "Phone & internet" },
];

const NOISE =
  /\b(visa|mastercard|eftpos|purchase|card|payment|recurring|direct debit|debit|pos|tap|contactless|auth|ref|value date|aus?|au|pty|ltd|inc|llc|www|com|net|org|sydney|melbourne|brisbane|adelaide|perth|nsw|vic|qld|sa|wa)\b/gi;

/** A short key for a merchant, so "NETFLIX.COM 12345 SYDNEY AU" and "NETFLIX.COM 67890" match. */
export function merchantKey(description: string): string {
  const cleaned = description
    .toLowerCase()
    .replace(/\b(paypal|sq|sp|tst|pp)\s*\*/g, " ")
    .replace(/[0-9]{2}[/-][0-9]{2}([/-][0-9]{2,4})?/g, " ")
    .replace(/\b[a-z]*\d[a-z0-9]*\b/g, " ")
    .replace(/[^a-z+ ]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ").slice(0, 2).join(" ") || description.toLowerCase().slice(0, 12);
}

export function billedVia(description: string): Via | undefined {
  if (/apple\.com\/bill|itunes|apple\.com bill/i.test(description)) return "Apple";
  if (/google ?\*|google play|play\.google/i.test(description)) return "Google Play";
  if (/paypal/i.test(description)) return "PayPal";
  return undefined;
}

const DAY = 86400e3;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const median = (n: number[]) => [...n].sort((a, b) => a - b)[Math.floor(n.length / 2)];

export function cadenceFor(gap: number): Cadence | null {
  if (gap >= 5 && gap <= 9) return "weekly";
  if (gap >= 12 && gap <= 16) return "fortnightly";
  if (gap >= 26 && gap <= 35) return "monthly";
  if (gap >= 84 && gap <= 98) return "quarterly";
  if (gap >= 350 && gap <= 380) return "yearly";
  return null;
}

const PER_YEAR: Record<Cadence, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 };
const STEP: Record<Cadence, number> = { weekly: 7, fortnightly: 14, monthly: 30, quarterly: 91, yearly: 365 };

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Repeating money-out charges: the same merchant, a steady rhythm and a steady amount. A recognised service needs only one charge. */
export function detectSubscriptions(txns: Txn[]): Subscription[] {
  const groups = new Map<string, { txns: Txn[]; known?: KnownService }>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const known = KNOWN.find((k) => k.match.test(t.description));
    const key = known ? `k:${known.name}` : merchantKey(t.description);
    const g = groups.get(key) ?? { txns: [], known };
    g.txns.push(t);
    groups.set(key, g);
  }
  const out: Subscription[] = [];
  for (const [key, g] of groups) {
    const list = [...g.txns].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = list.map((t) => Math.abs(t.amount));
    const latest = list[list.length - 1];
    let cadence: Cadence | null = null;
    if (list.length >= 2) {
      const gaps = list
        .slice(1)
        .map((t, i) => days(list[i].date, t.date))
        .filter((d) => d > 0);
      if (gaps.length) {
        const c = cadenceFor(median(gaps));
        const fits = gaps.filter((d) => c && cadenceFor(d) === c).length / gaps.length;
        const med = median(amounts);
        const steady = amounts.filter((a) => Math.abs(a - med) <= Math.max(0.5, med * 0.2)).length / amounts.length;
        if (c && fits >= 0.6 && (steady >= 0.6 || g.known)) cadence = c;
      }
    }
    if (!cadence && g.known) {
      // a recognised service with too few or uneven charges to tell: a big single charge is most likely a yearly plan, otherwise monthly
      cadence = list.length === 1 && Math.abs(latest.amount) >= 60 && g.known.category !== "Phone & internet" ? "yearly" : "monthly";
    }
    if (!cadence) continue;
    const amount = Math.abs(latest.amount);
    const prev = list.length >= 2 ? Math.abs(list[list.length - 2].amount) : amount;
    out.push({
      id: slug(g.known?.name ?? key) || key,
      name: g.known?.name ?? titleCase(key),
      category: g.known?.category ?? "Other",
      amount,
      cadence,
      monthly: round((amount * PER_YEAR[cadence]) / 12),
      yearly: round(amount * PER_YEAR[cadence]),
      lastDate: latest.date,
      nextDate: addDays(latest.date, STEP[cadence]),
      count: list.length,
      known: !!g.known,
      via: billedVia(latest.description),
      priceChange: Math.abs(amount - prev) > Math.max(0.5, prev * 0.03) ? { from: round(prev), to: round(amount) } : undefined,
    });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

const round = (n: number) => Math.round(n * 100) / 100;
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function totals(subs: Subscription[]) {
  const live = subs.filter((s) => !s.hidden);
  return {
    monthly: round(live.reduce((n, s) => n + s.monthly, 0)),
    yearly: round(live.reduce((n, s) => n + s.yearly, 0)),
    count: live.length,
  };
}

export function byCategory(subs: Subscription[]): { category: Category; items: Subscription[]; monthly: number }[] {
  return CATEGORIES.map((category) => {
    const items = subs.filter((s) => !s.hidden && s.category === category).sort((a, b) => b.monthly - a.monthly);
    return { category, items, monthly: round(items.reduce((n, s) => n + s.monthly, 0)) };
  }).filter((g) => g.items.length);
}

/** Merge a fresh detection into what is saved: new ones are added, seen ones refreshed, your "not a subscription" choices kept. */
export function mergeDetected(saved: Subscription[], found: Subscription[]): Subscription[] {
  const hidden = new Set(saved.filter((s) => s.hidden).map((s) => s.id));
  const ids = new Set(found.map((s) => s.id));
  return [...found.map((s) => ({ ...s, hidden: hidden.has(s.id) || undefined })), ...saved.filter((s) => !ids.has(s.id))];
}

/** Subscriptions you marked cancelled that were charged again after that date. */
export function chargedAfterCancel(subs: Subscription[], cancelled: Record<string, string>): Subscription[] {
  return subs.filter((s) => cancelled[s.id] && s.lastDate > cancelled[s.id]);
}

export interface CancelGuide {
  title: string;
  steps: string[];
  links: { label: string; url: string }[];
}

const searchUrl = (name: string) => `https://www.google.com/search?q=${encodeURIComponent(`cancel ${name} subscription`)}`;

const VIA: Record<Via, { label: string; url: string; step: string }> = {
  Apple: {
    label: "Open Apple subscriptions",
    url: "https://apps.apple.com/account/subscriptions",
    step: "This charge is billed through Apple. On an iPhone: Settings → your name → Subscriptions. On a Mac: App Store → your name → Account Settings → Subscriptions. Choose it, then Cancel Subscription.",
  },
  "Google Play": {
    label: "Open Google Play subscriptions",
    url: "https://play.google.com/store/account/subscriptions",
    step: "This charge is billed through Google Play. Open Google Play → your profile picture → Payments & subscriptions → Subscriptions, choose it, then Cancel subscription.",
  },
  PayPal: {
    label: "Open PayPal automatic payments",
    url: "https://www.paypal.com/myaccount/autopay/",
    step: "This charge is billed through PayPal. Open PayPal → Settings (the cog) → Payments → Manage automatic payments, choose the merchant, then Cancel automatic payments.",
  },
};

/** Plain steps and links for cancelling. The provider's own page when we know it, otherwise a search. */
export function cancelGuide(s: Pick<Subscription, "name" | "via" | "known">): CancelGuide {
  const known = KNOWN.find((k) => k.name === s.name);
  const steps: string[] = [];
  const links: CancelGuide["links"] = [];
  if (s.via) {
    steps.push(VIA[s.via].step);
    links.push({ label: VIA[s.via].label, url: VIA[s.via].url });
  }
  if (known?.manage && !s.via) {
    steps.push(`Sign in to your ${s.name} account and open the page for your plan or subscription, then choose Cancel.`);
    links.push({ label: `Open ${s.name} account page`, url: known.manage });
  }
  if (!steps.length)
    steps.push(`Sign in to ${s.name}'s website or app and look under Account, Billing, Plan or Membership for a Cancel option.`);
  links.push({ label: `Search: how to cancel ${s.name}`, url: searchUrl(s.name) });
  steps.push("Keep the confirmation email or screen. It shows when the last charge will be and that it has really stopped.");
  steps.push(
    "Come back and press “I've cancelled it”. If it is charged again after that date, import your next statement and the app will tell you.",
  );
  return { title: `Cancel ${s.name}`, steps, links };
}
