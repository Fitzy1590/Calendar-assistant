/** Ready-made suggestions for settings, so most fields are one tap instead of typing. Pure, so they are tested. */

export const DEVICE_NAMES = {
  windows: ["Home PC", "Work PC", "Desk PC", "Laptop"],
  android: ["My phone", "Pixel", "Samsung phone", "Tablet"],
} as const;

export const NEWS_KEYWORDS = [
  "Formula 1",
  "AFL",
  "NRL",
  "Cricket",
  "Property",
  "Interest rates",
  "Climate",
  "Travel",
  "Electric cars",
  "Space",
];

export const POPULAR_TEAMS = [
  "Sydney Swans",
  "Collingwood",
  "Brisbane Broncos",
  "Melbourne Storm",
  "Arsenal",
  "Manchester United",
  "Liverpool",
  "Lakers",
];

export const SYNC_URL_IDEAS = [
  { label: "This PC (testing)", value: "ws://localhost:8787" },
  { label: "Home network example", value: "ws://192.168.1.10:8787" },
];

export const RULE_KEYWORDS = ["invoice", "bill", "payment due", "receipt", "booking", "appointment", "delivery", "password reset"];

/** Where to get each key or ID, so nobody has to search for it. */
export const KEY_LINKS = {
  anthropic: { label: "Get an Anthropic key", url: "https://console.anthropic.com/settings/keys" },
  picovoice: { label: "Get a Picovoice AccessKey", url: "https://console.picovoice.ai/" },
  ticketmaster: { label: "Get a Ticketmaster key", url: "https://developer.ticketmaster.com/user/register" },
  googleCloud: { label: "Open Google Cloud credentials", url: "https://console.cloud.google.com/apis/credentials" },
  entra: {
    label: "Open Microsoft Entra app registrations",
    url: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  },
} as const;

/** Week start and clock style that suit this region's habits. */
export function regionDefaults(locale: string, hour12Probe?: boolean): { weekStartsOn: 0 | 1; clock24: boolean } {
  let weekStartsOn: 0 | 1 = 1;
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const first = (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay;
    if (first === 7) weekStartsOn = 0;
  } catch {
    /* an odd locale: keep Monday */
  }
  let hour12 = hour12Probe;
  if (hour12 === undefined) {
    try {
      hour12 = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12;
    } catch {
      hour12 = false;
    }
  }
  return { weekStartsOn, clock24: !hour12 };
}

/** A likely town from the time zone ("Australia/Sydney" → "Sydney"). */
export function cityGuesses(timeZone: string): string[] {
  const last = timeZone.split("/").pop() ?? "";
  if (!timeZone.includes("/") || /^(GMT|UTC|Etc)/i.test(timeZone)) return [];
  return [last.replace(/_/g, " ")];
}

/** The most common sender domains in your mail, as `@domain` for rules. Newest-first input; people@ gmail-style hosts are skipped. */
const FREE_MAIL = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "bigpond.com",
  "bigpond.net.au",
  "telstra.com",
]);
export function senderIdeas(addresses: string[], max = 5): string[] {
  const n = new Map<string, number>();
  for (const a of addresses) {
    const d = a.toLowerCase().split("@")[1];
    if (d && !FREE_MAIL.has(d)) n.set(d, (n.get(d) ?? 0) + 1);
  }
  return [...n]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([d]) => "@" + d);
}
