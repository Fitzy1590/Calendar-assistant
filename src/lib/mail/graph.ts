import { htmlToText } from "./text";
import type { MailAddr, RawMail } from "./types";

/**
 * Microsoft Graph (Outlook / Hotmail) mail adapter. Read-only for now (scope Mail.Read).
 * Takes an injected API function like googleSync.ts, so it is tested against a fake Graph.
 */

export const GRAPH = "https://graph.microsoft.com/v1.0";
/** One authorised Graph call: the JSON, or null for 204 / 410. Throws "Graph <status>: …" otherwise. */
export type GraphApi = (url: string, init?: RequestInit) => Promise<any>;

const SELECT =
  "id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,bodyPreview,importance,inferenceClassification";
const WANTED_HEADERS = ["list-unsubscribe", "list-id", "precedence", "auto-submitted"];

const addr = (r: any): MailAddr => ({
  name: r?.emailAddress?.name || undefined,
  address: String(r?.emailAddress?.address ?? "").toLowerCase(),
});

export function mapMessage(g: any, accountId: string): RawMail {
  return {
    id: `${accountId}:${g.id}`,
    accountId,
    providerId: g.id,
    threadId: g.conversationId ?? g.id,
    subject: g.subject ?? "(no subject)",
    from: addr(g.from),
    to: (g.toRecipients ?? []).map(addr),
    cc: (g.ccRecipients ?? []).map(addr),
    receivedAt: Date.parse(g.receivedDateTime) || 0,
    isRead: !!g.isRead,
    preview: String(g.bodyPreview ?? "").slice(0, 400),
    folder: "inbox",
    headers: {},
    importance: g.importance === "high" || g.importance === "low" ? g.importance : "normal",
    focused: g.inferenceClassification ? g.inferenceClassification === "focused" : undefined,
  };
}

/** The few headers that say "this is a mailing list", for up to 20 messages per request ($batch). */
export async function fetchHeaders(api: GraphApi, providerIds: string[]): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (let i = 0; i < providerIds.length; i += 20) {
    const chunk = providerIds.slice(i, i + 20);
    const res = await api(`${GRAPH}/$batch`, {
      method: "POST",
      body: JSON.stringify({
        requests: chunk.map((id, n) => ({ id: String(n), method: "GET", url: `/me/messages/${id}?$select=internetMessageHeaders` })),
      }),
    });
    for (const r of res?.responses ?? []) {
      const id = chunk[Number(r.id)];
      if (!id || r.status !== 200) continue;
      const h: Record<string, string> = {};
      for (const x of r.body?.internetMessageHeaders ?? []) {
        const name = String(x.name).toLowerCase();
        if (WANTED_HEADERS.includes(name)) h[name] = String(x.value);
      }
      out[id] = h;
    }
  }
  return out;
}

export interface InboxSync {
  upserts: RawMail[];
  removedIds: string[]; // full ids (`account:provider`)
  deltaLink?: string;
  initial: boolean; // the first sync (or a fresh start after Graph dropped the bookmark): don't alert for the backlog
}

/** What changed in the inbox since `deltaLink`; without one, the last `sinceDays` days. */
export async function syncInbox(api: GraphApi, acct: { id: string; deltaLink?: string }, sinceDays = 30): Promise<InboxSync> {
  const fresh = () =>
    `${GRAPH}/me/mailFolders/inbox/messages/delta?$select=${SELECT}&$filter=receivedDateTime ge ${new Date(Date.now() - sinceDays * 864e5).toISOString()}`;
  const run = async (start: string): Promise<{ items: any[]; deltaLink?: string } | null> => {
    const items: any[] = [];
    let url: string | undefined = start;
    let deltaLink: string | undefined;
    for (let i = 0; i < 40 && url; i++) {
      const j = await api(url, { headers: { Prefer: "odata.maxpagesize=50" } });
      if (!j) return null; // 410: the bookmark expired
      items.push(...(j.value ?? []));
      deltaLink = j["@odata.deltaLink"] ?? deltaLink;
      url = j["@odata.nextLink"];
    }
    return { items, deltaLink };
  };
  let initial = !acct.deltaLink;
  let res = acct.deltaLink ? await run(acct.deltaLink) : await run(fresh());
  if (!res) {
    initial = true;
    res = (await run(fresh())) ?? { items: [] };
  }
  const removedIds = res.items.filter((g) => g["@removed"]).map((g) => `${acct.id}:${g.id}`);
  const upserts = res.items.filter((g) => !g["@removed"]).map((g) => mapMessage(g, acct.id));
  try {
    const hdrs = await fetchHeaders(
      api,
      upserts.map((m) => m.providerId),
    );
    for (const m of upserts) m.headers = hdrs[m.providerId] ?? {};
  } catch {
    /* headers only sharpen the sorting; a failure here must not lose the messages */
  }
  return { upserts, removedIds, deltaLink: res.deltaLink, initial };
}

/** Full message text (plain). */
export async function fetchBodyText(api: GraphApi, providerId: string): Promise<string> {
  const j = await api(`${GRAPH}/me/messages/${providerId}?$select=body`, { headers: { Prefer: 'outlook.body-content-type="text"' } });
  const b = j?.body;
  if (!b?.content) return "";
  return b.contentType === "html" ? htmlToText(b.content) : String(b.content).trim();
}

/** The signed-in person's address and name. */
export async function fetchProfile(api: GraphApi): Promise<{ address: string; name: string }> {
  const j = await api(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`);
  return { address: String(j?.mail || j?.userPrincipalName || "").toLowerCase(), name: String(j?.displayName || "") };
}
