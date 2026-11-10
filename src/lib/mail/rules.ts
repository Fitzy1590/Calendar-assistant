import type { MailMessage, MailRule, MailSettings } from "./types";

/** Your own rules: matching, building one from an email, describing it in words, and suggesting rules. Pure. */

const lc = (s: string) => s.trim().toLowerCase();

/** "sam@x.com" matches that address; "@energyco.com" or "energyco.com" matches anyone at that domain (and its subdomains). */
export function senderMatches(pattern: string, address: string): boolean {
  const p = lc(pattern).replace(/^@/, "");
  const a = lc(address);
  if (!p) return false;
  if (p.includes("@")) return a === p;
  const domain = a.split("@")[1] ?? "";
  return domain === p || domain.endsWith("." + p);
}

export function matchRule(rule: Pick<MailRule, "senders" | "keywords" | "keywordMode">, m: Pick<MailMessage, "from" | "subject">): boolean {
  const senders = rule.senders.filter((s) => s.trim());
  const keywords = rule.keywords.map(lc).filter(Boolean);
  if (!senders.length && !keywords.length) return false; // an empty rule matches nothing
  if (senders.length && !senders.some((s) => senderMatches(s, m.from.address))) return false;
  if (keywords.length) {
    const subject = lc(m.subject);
    const hit = (k: string) => subject.includes(k);
    if (!(rule.keywordMode === "all" ? keywords.every(hit) : keywords.some(hit))) return false;
  }
  return true;
}

export interface RuleEffect {
  important: boolean;
  notify: boolean;
  muted: boolean;
  bill: boolean;
  names: string[]; // the rules that matched
}

/** What all matching, enabled rules do to a message. Mute wins over important and notify. */
export function applyRules(rules: MailRule[], m: Pick<MailMessage, "from" | "subject">): RuleEffect {
  const hits = rules.filter((r) => r.enabled && matchRule(r, m));
  const muted = hits.some((r) => r.mute);
  return {
    important: !muted && hits.some((r) => r.important),
    notify: !muted && hits.some((r) => r.notify),
    muted,
    bill: hits.some((r) => r.bill),
    names: hits.map((r) => r.name || describeRule(r)),
  };
}

export function describeRule(r: MailRule): string {
  const who = r.senders.filter(Boolean).join(", ");
  const kw = r.keywords.filter(Boolean);
  const words = kw.length ? `subject has ${kw.map((k) => `“${k}”`).join(r.keywordMode === "all" ? " and " : " or ")}` : "";
  const when = [who && `From ${who}`, words].filter(Boolean).join(", ") || "Nothing set yet";
  const does = [r.mute && "Mute", r.important && "Important", r.notify && "Always notify", r.bill && "Bills"].filter(Boolean).join(" + ");
  return `${when} → ${does || "no action"}`;
}

export const newRule = (p: Partial<MailRule> = {}): MailRule => ({
  id: crypto.randomUUID().slice(0, 8),
  name: "",
  enabled: true,
  senders: [],
  keywords: [],
  keywordMode: "any",
  important: false,
  notify: false,
  mute: false,
  bill: false,
  ...p,
});

export type SenderAction = "important" | "mute" | "bill";

/** A rule for everything from this message's sender. Same sender + same action twice just switches the existing rule on. */
export function ruleForSender(
  existing: MailRule[],
  m: Pick<MailMessage, "from">,
  action: SenderAction,
): { rule: MailRule; created: boolean } {
  const addr = lc(m.from.address);
  const have = existing.find((r) => r.senders.length === 1 && lc(r.senders[0]) === addr && !r.keywords.length && r[action]);
  if (have) return { rule: { ...have, enabled: true }, created: false };
  const who = m.from.name || m.from.address;
  const label = { important: "Always important", mute: "Mute", bill: "Bills" }[action];
  return {
    rule: newRule({
      name: `${label}: ${who}`,
      senders: [addr],
      important: action === "important",
      notify: action === "important",
      mute: action === "mute",
      bill: action === "bill",
    }),
    created: true,
  };
}

/** Problems with a rule being saved (empty list = fine). */
export function validateRule(r: MailRule): string[] {
  const out: string[] = [];
  if (!r.senders.some((s) => s.trim()) && !r.keywords.some((k) => k.trim())) out.push("Add a sender or at least one keyword.");
  if (!r.important && !r.notify && !r.mute && !r.bill) out.push("Choose what the rule does.");
  if (r.mute && (r.important || r.notify)) out.push("Mute can't be combined with Important or Always notify.");
  return out;
}

/** "a@x.com, b@y.com\n@c.com" → a clean list. */
export const parseList = (s: string): string[] => [
  ...new Set(
    s
      .split(/[,\n;]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

/* ----- suggestions ----- */

const THRESHOLD = 3;

/** Count a manual change for a sender. */
export function recordOverride(suggest: MailSettings["suggest"], address: string, kind: SenderAction): MailSettings["suggest"] {
  const a = lc(address);
  const cur = suggest.counts[a] ?? {};
  return { ...suggest, counts: { ...suggest.counts, [a]: { ...cur, [kind]: (cur[kind] ?? 0) + 1 } } };
}

/** The action to suggest making a rule for this sender, once they've been changed by hand a few times. */
export function suggestion(suggest: MailSettings["suggest"], rules: MailRule[], address: string): SenderAction | null {
  const a = lc(address);
  if (suggest.dismissed.includes(a)) return null;
  const c = suggest.counts[a] ?? {};
  for (const kind of ["mute", "important", "bill"] as const) {
    if ((c[kind] ?? 0) >= THRESHOLD && !rules.some((r) => r.enabled && r[kind] && r.senders.some((s) => senderMatches(s, a)))) return kind;
  }
  return null;
}
