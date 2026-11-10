import { decodeWords, parseAddrList, unescapeSnippet } from "./headers";
import type { InboxSync, MailProvider } from "./provider";
import { htmlToText } from "./text";
import type { RawMail } from "./types";

/**
 * Gmail adapter (read-only, scope gmail.readonly). Takes an injected API function like graph.ts, so it is tested
 * against a fake Gmail. First sync lists the last 30 days of Inbox; after that it follows Gmail's history from the
 * last historyId, and starts over if Gmail no longer has that history (404).
 */

export const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
/** One authorised Gmail call: the JSON, or null for 204. Throws "Google <status>: …" otherwise. */
export type GmailApi = (url: string, init?: RequestInit) => Promise<any>;

const META = [
  "From",
  "To",
  "Cc",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "List-Id",
  "Precedence",
  "Auto-Submitted",
  "X-Priority",
  "Importance",
];
const KEEP = ["list-unsubscribe", "list-id", "precedence", "auto-submitted"];

const headerMap = (payload: any): Record<string, string> => {
  const h: Record<string, string> = {};
  for (const x of payload?.headers ?? []) h[String(x.name).toLowerCase()] = String(x.value);
  return h;
};

export function mapGmail(g: any, accountId: string): RawMail {
  const h = headerMap(g.payload);
  const labels: string[] = g.labelIds ?? [];
  const prio = (h["x-priority"] ?? "").trim()[0];
  const imp = (h["importance"] ?? "").toLowerCase();
  return {
    id: `${accountId}:${g.id}`,
    accountId,
    providerId: g.id,
    threadId: g.threadId ?? g.id,
    subject: decodeWords(h["subject"] ?? "").trim() || "(no subject)",
    from: parseAddrList(h["from"])[0] ?? { address: "" },
    to: parseAddrList(h["to"]),
    cc: parseAddrList(h["cc"]),
    receivedAt: Number(g.internalDate) || Date.parse(h["date"] ?? "") || 0,
    isRead: !labels.includes("UNREAD"),
    preview: unescapeSnippet(String(g.snippet ?? "")).slice(0, 400),
    folder: "inbox",
    headers: Object.fromEntries(KEEP.filter((k) => h[k] !== undefined).map((k) => [k, h[k]])),
    importance: prio === "1" || prio === "2" || imp === "high" ? "high" : prio === "4" || prio === "5" || imp === "low" ? "low" : "normal",
  };
}

const inInbox = (g: any) => (g.labelIds ?? []).includes("INBOX") && !(g.labelIds ?? []).some((l: string) => l === "SPAM" || l === "TRASH");

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** The 404 Gmail returns when the history bookmark is too old. */
const expired = (e: unknown) => /Google 404/.test((e as Error).message);

export async function syncGmail(api: GmailApi, acct: { id: string; deltaLink?: string }, sinceDays = 30): Promise<InboxSync> {
  const profile = await api(`${GMAIL}/profile`);
  const historyId = String(profile?.historyId ?? "");
  const touched = new Map<string, "present" | "gone">();
  let initial = !acct.deltaLink;

  if (acct.deltaLink) {
    try {
      let page = "";
      do {
        const q =
          `startHistoryId=${acct.deltaLink}&labelId=INBOX&maxResults=500` +
          ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"].map((t) => `&historyTypes=${t}`).join("") +
          (page ? `&pageToken=${page}` : "");
        const j = await api(`${GMAIL}/history?${q}`);
        for (const h of j?.history ?? []) {
          for (const x of h.messagesAdded ?? []) touched.set(x.message.id, "present");
          for (const x of h.messagesDeleted ?? []) touched.set(x.message.id, "gone");
          for (const x of h.labelsAdded ?? []) touched.set(x.message.id, "present");
          for (const x of h.labelsRemoved ?? []) touched.set(x.message.id, (x.labelIds ?? []).includes("INBOX") ? "gone" : "present");
        }
        page = j?.nextPageToken ?? "";
      } while (page);
    } catch (e) {
      if (!expired(e)) throw e;
      initial = true;
      touched.clear();
    }
  }

  if (initial) {
    let page = "";
    for (let i = 0; i < 3; i++) {
      const j = await api(
        `${GMAIL}/messages?labelIds=INBOX&maxResults=100&q=${encodeURIComponent(`newer_than:${sinceDays}d`)}${page ? `&pageToken=${page}` : ""}`,
      );
      for (const m of j?.messages ?? []) touched.set(m.id, "present");
      page = j?.nextPageToken ?? "";
      if (!page) break;
    }
  }

  const removedIds: string[] = [...touched].filter(([, v]) => v === "gone").map(([id]) => `${acct.id}:${id}`);
  const want = [...touched].filter(([, v]) => v === "present").map(([id]) => id);
  const upserts: RawMail[] = [];
  const fetched = await pool(want, 6, async (id) => {
    try {
      return await api(`${GMAIL}/messages/${id}?format=metadata${META.map((h) => `&metadataHeaders=${h}`).join("")}`);
    } catch (e) {
      if (expired(e)) return null; // deleted since the list
      throw e;
    }
  });
  fetched.forEach((g, i) => {
    if (!g || !inInbox(g)) removedIds.push(`${acct.id}:${want[i]}`);
    else upserts.push(mapGmail(g, acct.id));
  });
  return { upserts, removedIds, deltaLink: historyId || acct.deltaLink, initial };
}

const b64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8").decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** Walk the MIME tree for the readable text: plain if there is some, else the HTML turned into text. */
export function bodyOf(payload: any): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: any) => {
    if (!p) return;
    const data = p.body?.data;
    if (data && p.mimeType === "text/plain") plain.push(b64url(data));
    else if (data && p.mimeType === "text/html") html.push(b64url(data));
    for (const c of p.parts ?? []) walk(c);
  };
  walk(payload);
  return plain.length ? plain.join("\n").trim() : htmlToText(html.join("\n"));
}

export const gmailProvider = (api: GmailApi): MailProvider => ({
  sync: (account) => syncGmail(api, account),
  bodyText: async (id) => bodyOf((await api(`${GMAIL}/messages/${id}?format=full`))?.payload),
});

/** The signed-in Google account's address. */
export async function gmailProfile(api: GmailApi): Promise<{ address: string }> {
  const j = await api(`${GMAIL}/profile`);
  return { address: String(j?.emailAddress ?? "").toLowerCase() };
}
