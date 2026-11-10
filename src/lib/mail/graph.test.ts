import { describe, expect, it } from "vitest";
import { fetchBodyText, syncInbox, type GraphApi } from "./graph";

/** A tiny fake Graph: an inbox with delta bookmarks, $batch headers and message bodies. */
function fakeGraph() {
  let v = 0;
  const msgs = new Map<string, any>();
  const removed: { id: string; v: number }[] = [];
  const calls: string[] = [];
  const add = (id: string, p: any = {}) =>
    msgs.set(id, {
      id,
      _v: ++v,
      subject: id,
      conversationId: "c-" + id,
      receivedDateTime: "2026-11-09T09:00:00Z",
      isRead: false,
      bodyPreview: "hi",
      importance: "normal",
      from: { emailAddress: { name: "A", address: "A@x.com" } },
      toRecipients: [{ emailAddress: { address: "me@outlook.com" } }],
      ccRecipients: [],
      inferenceClassification: "focused",
      headers: [],
      ...p,
    });
  const api: GraphApi = async (url, init) => {
    const u = new URL(url.replace("/$batch", "/batch"));
    calls.push((init?.method ?? "GET") + " " + u.pathname.replace("/v1.0", ""));
    if (u.pathname.endsWith("/batch")) {
      const { requests } = JSON.parse(init!.body as string);
      return {
        responses: requests.map((r: any) => {
          const m = msgs.get(r.url.split("/messages/")[1].split("?")[0]);
          return { id: r.id, status: m ? 200 : 404, body: { internetMessageHeaders: m?.headers } };
        }),
      };
    }
    if (u.pathname.includes("/messages/") && !u.pathname.includes("/delta")) {
      const m = msgs.get(u.pathname.split("/messages/")[1]);
      return { body: m.body };
    }
    const tok = u.searchParams.get("$deltatoken");
    if (tok && !/^d\d+$/.test(tok)) return null; // 410
    const since = tok ? Number(tok.slice(1)) : -1;
    const page = Number(u.searchParams.get("page") ?? 0);
    const all = [...msgs.values()]
      .filter((m) => m._v > since)
      .map(({ headers, body, _v, ...g }) => g)
      .concat(removed.filter((r) => r.v > since).map((r) => ({ id: r.id, "@removed": { reason: "deleted" } }) as any));
    const slice = all.slice(page * 2, page * 2 + 2); // tiny pages so paging is exercised
    const base = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta";
    return (page + 1) * 2 < all.length
      ? { value: slice, "@odata.nextLink": `${base}?${tok ? "$deltatoken=" + tok + "&" : ""}page=${page + 1}` }
      : { value: slice, "@odata.deltaLink": `${base}?$deltatoken=d${v}` };
  };
  return { api, add, msgs, calls, remove: (id: string) => (msgs.delete(id), removed.push({ id, v: ++v })) };
}

describe("Outlook inbox sync", () => {
  it("reads the inbox across pages, maps addresses and fetches list headers in one batch", async () => {
    const g = fakeGraph();
    g.add("m1", {
      headers: [
        { name: "List-Unsubscribe", value: "<mailto:u@x>" },
        { name: "X-Other", value: "no" },
      ],
    });
    g.add("m2", { importance: "high", inferenceClassification: "other" });
    g.add("m3");
    const r = await syncInbox(g.api, { id: "acc" });
    expect(r.initial).toBe(true);
    expect(r.upserts.map((m) => m.id)).toEqual(["acc:m1", "acc:m2", "acc:m3"]);
    expect(r.upserts[0].from.address).toBe("a@x.com"); // lower-cased
    expect(r.upserts[0].headers).toEqual({ "list-unsubscribe": "<mailto:u@x>" });
    expect(r.upserts[1]).toMatchObject({ importance: "high", focused: false });
    expect(g.calls.filter((c) => c.includes("batch"))).toHaveLength(1);
    expect(r.deltaLink).toMatch(/deltatoken=d\d+/);
  });
  it("next time returns only what changed, including deletions, and is not 'initial'", async () => {
    const g = fakeGraph();
    g.add("m1");
    g.add("m2");
    const first = await syncInbox(g.api, { id: "acc" });
    g.add("m3");
    g.remove("m1");
    const next = await syncInbox(g.api, { id: "acc", deltaLink: first.deltaLink });
    expect(next.initial).toBe(false);
    expect(next.upserts.map((m) => m.providerId)).toEqual(["m3"]);
    expect(next.removedIds).toEqual(["acc:m1"]);
  });
  it("starts over (initial) when Graph drops the bookmark", async () => {
    const g = fakeGraph();
    g.add("m1");
    const r = await syncInbox(g.api, {
      id: "acc",
      deltaLink: "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=expired",
    });
    expect(r.initial).toBe(true);
    expect(r.upserts).toHaveLength(1);
  });
  it("keeps the messages when the header lookup fails", async () => {
    const g = fakeGraph();
    g.add("m1");
    const api: GraphApi = (url, init) => (url.includes("batch") ? Promise.reject(new Error("Graph 429")) : g.api(url, init));
    expect((await syncInbox(api, { id: "acc" })).upserts).toHaveLength(1);
  });
  it("returns message text, converting HTML when that is all there is", async () => {
    const g = fakeGraph();
    g.add("t", { body: { contentType: "text", content: " Hello \n" } });
    g.add("h", { body: { contentType: "html", content: "<p>Hi&nbsp;there</p><script>x()</script><div>Bye</div>" } });
    expect(await fetchBodyText(g.api, "t")).toBe("Hello");
    expect(await fetchBodyText(g.api, "h")).toBe("Hi there\nBye");
  });
});
