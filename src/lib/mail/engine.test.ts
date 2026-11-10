import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../../store";
import { allMessages, clearAccount, getMessage, resetCacheConnection } from "./cache";
import {
  digestText,
  maybeDailyDigest,
  needsAttention,
  planAlerts,
  reclassifyCached,
  refreshMail,
  syncAccountWith,
  useMail,
} from "./engine";
import type { GraphApi } from "./graph";
import type { MailAccountMeta, MailMessage } from "./types";

const ACC: MailAccountMeta = { id: "acc", provider: "graph", address: "me@outlook.com", name: "Me", enabled: true, status: "ok" };
const mm = (p: Partial<MailMessage> = {}): MailMessage => ({
  id: "acc:1",
  accountId: "acc",
  providerId: "1",
  threadId: "t",
  subject: "Subject",
  from: { name: "Sam", address: "sam@example.com" },
  to: [],
  cc: [],
  receivedAt: 1,
  isRead: false,
  preview: "",
  folder: "inbox",
  headers: {},
  bucket: "action",
  important: true,
  reasons: [],
  ...p,
});

/** A scripted Graph: each call to the delta endpoint returns the next prepared page. */
function scripted(batches: any[][]): GraphApi {
  let n = 0;
  return async (url) => {
    if (url.includes("batch")) return { responses: [] };
    const items = batches[Math.min(n++, batches.length - 1)];
    return { value: items, "@odata.deltaLink": `https://graph.microsoft.com/v1.0/x/delta?$deltatoken=d${n}` };
  };
}
const gm = (id: string, p: any = {}) => ({
  id,
  conversationId: "c" + id,
  subject: "Hi",
  receivedDateTime: "2026-11-10T01:00:00Z",
  isRead: false,
  bodyPreview: "",
  from: { emailAddress: { name: "Sam", address: "sam@example.com" } },
  toRecipients: [{ emailAddress: { address: "me@outlook.com" } }],
  ccRecipients: [],
  inferenceClassification: "focused",
  importance: "normal",
  ...p,
});

beforeEach(async () => {
  await clearAccount("acc");
  resetCacheConnection();
  useStore.setState({ contacts: {} });
  useStore.getState().updateSettings((s) => {
    s.mail.accounts = [{ ...ACC }];
    s.mail.alerts = { homeCard: true, desktop: true, badge: true, dailySummary: true, summaryHour: 8 };
    s.mail.lastDigestOn = undefined;
  });
  useMail.setState({ messages: [] });
});

describe("alerts and summary text", () => {
  it("alerts individually for up to 3 and summarises more", () => {
    expect(planAlerts([mm(), mm({ id: "2" })])).toHaveLength(2);
    const many = planAlerts([mm(), mm({ id: "2" }), mm({ id: "3" }), mm({ id: "4" })]);
    expect(many).toHaveLength(1);
    expect(many[0].title).toBe("4 new important emails");
  });
  it("counts only important, unread, undismissed mail", () => {
    expect(needsAttention([mm(), mm({ isRead: true }), mm({ dismissed: true }), mm({ important: false })])).toHaveLength(1);
  });
  it("writes a digest only when something needs attention", () => {
    expect(digestText([mm({ important: false })])).toBeNull();
    expect(digestText([mm()])!.title).toBe("Email: 1 needs your attention");
    expect(digestText([mm(), mm({ id: "2" }), mm({ id: "3" }), mm({ id: "4" }), mm({ id: "5" })])!.body).toContain("…and 2 more");
  });
});

describe("syncing an account", () => {
  it("sorts mail, caches it, and does not alert for the first sync's backlog", async () => {
    const alert = vi.fn();
    const api = scripted([
      [
        gm("1", { subject: "Can you confirm today?" }),
        gm("2", { subject: "Sale", bodyPreview: "unsubscribe", from: { emailAddress: { address: "newsletter@shop.com" } } }),
      ],
    ]);
    const fresh = await syncAccountWith(api, useStore.getState().settings.mail.accounts[0], alert);
    expect(fresh).toEqual([]);
    expect(alert).not.toHaveBeenCalled();
    const urgent = await getMessage("acc:1");
    const sub = await getMessage("acc:2");
    expect(urgent).toMatchObject({ bucket: "urgent", important: true });
    expect(sub).toMatchObject({ bucket: "subscriptions", important: false });
    expect(useStore.getState().settings.mail.accounts[0]).toMatchObject({ status: "ok", deltaLink: expect.stringContaining("d1") });
  });
  it("alerts for new important mail afterwards, but never for junk, subscriptions or old mail", async () => {
    const alert = vi.fn();
    const api = scripted([
      [gm("1")],
      [
        gm("1", { isRead: false }),
        gm("3", { subject: "Please send the report" }),
        gm("4", { subject: "Deals", bodyPreview: "unsubscribe", from: { emailAddress: { address: "newsletter@shop.com" } } }),
      ],
    ]);
    await syncAccountWith(api, useStore.getState().settings.mail.accounts[0], alert);
    const fresh = await syncAccountWith(api, useStore.getState().settings.mail.accounts[0], alert);
    expect(fresh.map((m) => m.providerId)).toEqual(["3"]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toBe("Please send the report");
  });
  it("stays quiet when desktop alerts are off", async () => {
    const alert = vi.fn();
    useStore.getState().updateSettings((s) => void (s.mail.alerts.desktop = false));
    const api = scripted([[gm("1")], [gm("3", { subject: "Please reply" })]]);
    const acc = () => useStore.getState().settings.mail.accounts[0];
    await syncAccountWith(api, acc(), alert);
    await syncAccountWith(api, acc(), alert);
    expect(alert).not.toHaveBeenCalled();
  });
  it("keeps a message dismissed here when it syncs again", async () => {
    const api = scripted([[gm("1", { subject: "Please reply" })], [gm("1", { subject: "Please reply" })]]);
    const acc = () => useStore.getState().settings.mail.accounts[0];
    await syncAccountWith(api, acc(), vi.fn());
    const { putMessages } = await import("./cache");
    await putMessages([{ ...(await getMessage("acc:1"))!, dismissed: true }], true);
    await syncAccountWith(api, acc(), vi.fn());
    expect((await getMessage("acc:1"))?.dismissed).toBe(true);
  });
  it("marks the account as needing sign-in when the token is gone", async () => {
    const api: GraphApi = async () => {
      throw new Error("invalid_grant");
    };
    await expect(syncAccountWith(api, useStore.getState().settings.mail.accounts[0], vi.fn())).rejects.toThrow();
    expect(useStore.getState().settings.mail.accounts[0].status).toBe("needs-reconnect");
  });
  it("re-sorts cached mail when the rules change", async () => {
    await syncAccountWith(scripted([[gm("1", { subject: "Lunch", to: [] })]]), useStore.getState().settings.mail.accounts[0], vi.fn());
    expect((await getMessage("acc:1"))?.important).toBe(false);
    useStore.getState().updateSettings((s) => void (s.mail.important.everything = true));
    await reclassifyCached();
    expect((await getMessage("acc:1"))?.important).toBe(true);
    expect((await allMessages()).length).toBe(1);
    useStore.getState().updateSettings((s) => void (s.mail.important.everything = false));
  });
});

describe("daily summary", () => {
  const at = (h: number) => new Date(2026, 10, 10, h, 0);
  it("sends once a day after the chosen hour, and not before", async () => {
    const alert = vi.fn();
    useMail.setState({ messages: [mm()] });
    expect(await maybeDailyDigest(at(7), alert)).toBe(false);
    expect(await maybeDailyDigest(at(9), alert)).toBe(true);
    expect(await maybeDailyDigest(at(10), alert)).toBe(false);
    expect(alert).toHaveBeenCalledTimes(1);
  });
  it("sends nothing, but still counts the day, when nothing needs attention", async () => {
    const alert = vi.fn();
    useMail.setState({ messages: [mm({ isRead: true })] });
    expect(await maybeDailyDigest(at(9), alert)).toBe(false);
    expect(useStore.getState().settings.mail.lastDigestOn).toBe("2026-11-10");
    expect(alert).not.toHaveBeenCalled();
  });
  it("is off when switched off or with no accounts", async () => {
    useMail.setState({ messages: [mm()] });
    useStore.getState().updateSettings((s) => void (s.mail.alerts.dailySummary = false));
    expect(await maybeDailyDigest(at(9), vi.fn())).toBe(false);
  });
});

it("refreshMail loads the cache into the view store", async () => {
  await syncAccountWith(scripted([[gm("1")]]), useStore.getState().settings.mail.accounts[0], vi.fn());
  await refreshMail();
  expect(useMail.getState().messages).toHaveLength(1);
});
