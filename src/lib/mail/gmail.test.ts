import { describe, expect, it } from "vitest";
import { bodyOf, GMAIL, gmailProvider, mapGmail, syncGmail, type GmailApi } from "./gmail";

const b64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const msg = (id: string, over: any = {}) => ({
  id,
  threadId: "t" + id,
  labelIds: ["INBOX", "UNREAD"],
  snippet: "Pay &amp; save",
  internalDate: "1700000000000",
  payload: {
    headers: [
      { name: "From", value: '"Energy Co" <bills@energyco.com>' },
      { name: "To", value: "me@gmail.com" },
      { name: "Subject", value: "=?UTF-8?B?Q2Fmw6k=?= bill " + id },
      { name: "List-Unsubscribe", value: "<mailto:u@x.com>" },
      { name: "X-Priority", value: "1" },
    ],
  },
  ...over,
});

/** A small fake Gmail: messages by id, a list, and a scripted history. */
function fake(opts: { msgs: any[]; history?: any[]; historyId?: string; historyFails?: boolean }) {
  const calls: string[] = [];
  const api: GmailApi = async (url) => {
    calls.push(url.replace(GMAIL, ""));
    if (url.endsWith("/profile")) return { emailAddress: "me@gmail.com", historyId: opts.historyId ?? "100" };
    if (url.includes("/history?")) {
      if (opts.historyFails) throw new Error("Google 404: not found");
      return { history: opts.history ?? [] };
    }
    if (url.includes("/messages?")) return { messages: opts.msgs.map((m) => ({ id: m.id })) };
    const m = url.match(/\/messages\/([^?]+)/);
    if (m) {
      const g = opts.msgs.find((x) => x.id === m[1]);
      if (!g) throw new Error("Google 404: gone");
      return g;
    }
    throw new Error("unexpected " + url);
  };
  return { api, calls };
}

describe("Gmail mapping", () => {
  it("maps headers, labels and the sender's priority", () => {
    const m = mapGmail(msg("1"), "acc");
    expect(m).toMatchObject({
      id: "acc:1",
      providerId: "1",
      subject: "Café bill 1",
      from: { name: "Energy Co", address: "bills@energyco.com" },
      isRead: false,
      preview: "Pay & save",
      importance: "high",
      receivedAt: 1700000000000,
    });
    expect(m.headers["list-unsubscribe"]).toBe("<mailto:u@x.com>");
    expect(mapGmail(msg("2", { labelIds: ["INBOX"] }), "acc").isRead).toBe(true);
  });
  it("reads the plain-text part, else the HTML", () => {
    const plain = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("Hello, café") } },
        { mimeType: "text/html", body: { data: b64("<p>Hi</p>") } },
      ],
    };
    expect(bodyOf(plain)).toBe("Hello, café");
    expect(bodyOf({ mimeType: "text/html", body: { data: b64("<p>Amount due</p><p>$40</p>") } })).toContain("Amount due");
  });
});

describe("Gmail sync", () => {
  it("first sync lists the Inbox, marks it initial and keeps the historyId", async () => {
    const { api } = fake({ msgs: [msg("1"), msg("2")] });
    const r = await syncGmail(api, { id: "acc" });
    expect(r.initial).toBe(true);
    expect(r.upserts.map((m) => m.providerId).sort()).toEqual(["1", "2"]);
    expect(r.deltaLink).toBe("100");
  });
  it("later syncs follow history: new mail, read changes, and removals", async () => {
    const history = [
      { messagesAdded: [{ message: { id: "3" } }] },
      { labelsRemoved: [{ message: { id: "1" }, labelIds: ["UNREAD"] }] },
      { labelsRemoved: [{ message: { id: "2" }, labelIds: ["INBOX"] }] },
      { messagesDeleted: [{ message: { id: "4" } }] },
    ];
    const { api } = fake({ msgs: [msg("1", { labelIds: ["INBOX"] }), msg("3")], history, historyId: "200" });
    const r = await syncGmail(api, { id: "acc", deltaLink: "100" });
    expect(r.initial).toBe(false);
    expect(r.upserts.map((m) => [m.providerId, m.isRead]).sort()).toEqual([
      ["1", true],
      ["3", false],
    ]);
    expect(r.removedIds.sort()).toEqual(["acc:2", "acc:4"]);
    expect(r.deltaLink).toBe("200");
  });
  it("starts over when Gmail no longer has the history", async () => {
    const { api } = fake({ msgs: [msg("1")], historyFails: true });
    const r = await syncGmail(api, { id: "acc", deltaLink: "1" });
    expect(r.initial).toBe(true);
    expect(r.upserts).toHaveLength(1);
  });
  it("treats mail that left the Inbox (archived, spam) as removed", async () => {
    const { api } = fake({
      msgs: [msg("1", { labelIds: ["SPAM"] }), msg("2", { labelIds: ["CATEGORY_UPDATES"] })],
      history: [{ messagesAdded: [{ message: { id: "1" } }, { message: { id: "2" } }] }],
    });
    const r = await syncGmail(api, { id: "acc", deltaLink: "1" });
    expect(r.upserts).toEqual([]);
    expect(r.removedIds.sort()).toEqual(["acc:1", "acc:2"]);
  });
  it("an unexpected error is not swallowed", async () => {
    const api: GmailApi = async (url) => {
      if (url.endsWith("/profile")) return { historyId: "1" };
      throw new Error("Google 403: nope");
    };
    await expect(syncGmail(api, { id: "acc", deltaLink: "1" })).rejects.toThrow("Google 403");
  });
  it("bodyText reads the full message", async () => {
    const api: GmailApi = async () => ({ payload: { mimeType: "text/plain", body: { data: b64("Amount due $12") } } });
    expect(await gmailProvider(api).bodyText("1")).toBe("Amount due $12");
  });
});
