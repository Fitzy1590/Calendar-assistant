import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../../store";
import { allMessages, clearAccount, getMessage, resetCacheConnection } from "./cache";
import {
  addSenderRule,
  billToCalendar,
  billToTask,
  deleteRule,
  digestText,
  markPaid,
  maybeBillReminders,
  maybeDailyDigest,
  needsAttention,
  paidBills,
  planAlerts,
  reclassifyCached,
  refreshMail,
  saveRule,
  setOverride,
  syncAccountWith,
  syncAccountWithProvider,
  unpaidBills,
  useMail,
} from "./engine";
import { newRule } from "./rules";
import type { GraphApi } from "./graph";
import type { MailProvider } from "./provider";
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

/** A scripted Graph: each call to the delta endpoint returns the next prepared page. `bodies` answers message-text requests. */
function scripted(batches: any[][], bodies: Record<string, string> = {}): GraphApi {
  let n = 0;
  return async (url) => {
    if (url.includes("batch")) return { responses: [] };
    const body = url.match(/\/me\/messages\/([^?]+)/);
    if (body) return { body: { contentType: "text", content: bodies[body[1]] ?? "" } };
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
    s.mail.alerts = { homeCard: true, desktop: true, sound: false, badge: true, dailySummary: true, summaryHour: 8 };
    s.mail.lastDigestOn = undefined;
  });
  useMail.setState({ messages: [] });
  useStore.setState({ events: {}, tasks: {} });
  useStore.getState().updateSettings((s) => {
    s.mail.rules = [];
    s.mail.suggest = { counts: {}, dismissed: [] };
    s.mail.bills = { remindDays: 2 };
  });
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

const first = () => useStore.getState().settings.mail.accounts[0];
const billMail = (id: string, p: any = {}) =>
  gm(id, {
    subject: "Your bill is ready",
    bodyPreview: "View your bill online",
    from: { emailAddress: { name: "Energy Co", address: "bills@energyco.com" } },
    receivedDateTime: "2026-11-10T01:00:00Z",
    ...p,
  });

describe("your rules in the sync", () => {
  it("applies a sender rule on the next sync, and always-notify alerts even for non-important mail", async () => {
    await saveRule(newRule({ senders: ["news@club.com"], notify: true, name: "Club" }));
    const alert = vi.fn();
    const api = scripted([[gm("1")], [gm("2", { subject: "Club night", from: { emailAddress: { address: "news@club.com" } } })]]);
    await syncAccountWith(api, first(), alert);
    const fresh = await syncAccountWith(api, first(), alert);
    expect(fresh.map((m) => m.providerId)).toEqual(["2"]);
    expect(alert).toHaveBeenCalledTimes(1);
  });
  it("mute keeps a Contact out of attention and alerts", async () => {
    useStore.setState({ contacts: { c: { id: "c", updatedAt: 1, name: "Mum", email: "mum@family.com" } } as any });
    await saveRule(newRule({ senders: ["mum@family.com"], mute: true }));
    const alert = vi.fn();
    const api = scripted([[gm("1")], [gm("2", { from: { emailAddress: { address: "mum@family.com" } } })]]);
    await syncAccountWith(api, first(), alert);
    await syncAccountWith(api, first(), alert);
    await refreshMail();
    expect(alert).not.toHaveBeenCalled();
    expect(needsAttention(useMail.getState().messages)).toHaveLength(0);
  });
  it("adding and deleting a rule re-sorts cached mail straight away", async () => {
    await syncAccountWith(scripted([[gm("1", { subject: "Lunch", toRecipients: [] })]]), first(), vi.fn());
    expect((await getMessage("acc:1"))?.important).toBe(false);
    const { rule } = await addSenderRule((await getMessage("acc:1"))!, "important");
    expect((await getMessage("acc:1"))?.important).toBe(true);
    await deleteRule(rule.id);
    expect((await getMessage("acc:1"))?.important).toBe(false);
  });
  it("'just this email' sticks across syncs and counts toward a suggestion", async () => {
    const api = scripted([[gm("1", { subject: "Lunch", toRecipients: [] })], [gm("1", { subject: "Lunch", toRecipients: [] })]]);
    await syncAccountWith(api, first(), vi.fn());
    await setOverride("acc:1", { important: true });
    await syncAccountWith(api, first(), vi.fn());
    expect(await getMessage("acc:1")).toMatchObject({ important: true, override: { important: true } });
    expect(useStore.getState().settings.mail.suggest.counts["sam@example.com"]).toEqual({ important: 1 });
    await setOverride("acc:1", { important: null });
    expect((await getMessage("acc:1"))?.important).toBe(false);
  });
});

describe("bills", () => {
  it("reads the amount and due date from the email text, and lists it as an unpaid bill", async () => {
    const api = scripted([[billMail("b1")]], { b1: "Hi Luke, your bill of $184.20 is due on 20 November 2026." });
    await syncAccountWith(api, first(), vi.fn());
    await refreshMail();
    const [b] = unpaidBills(useMail.getState().messages);
    expect(b).toMatchObject({ bill: true, amount: 184.2, dueDate: "2026-11-20" });
  });
  it("sorts unpaid bills by due date and marks paid / undo", async () => {
    const api = scripted([
      [billMail("b1", { bodyPreview: "due 25 November 2026 $10" }), billMail("b2", { bodyPreview: "due 15 November 2026 $20" })],
    ]);
    await syncAccountWith(api, first(), vi.fn());
    await refreshMail();
    expect(unpaidBills(useMail.getState().messages).map((m) => m.providerId)).toEqual(["b2", "b1"]);
    await markPaid("acc:b2");
    expect(unpaidBills(useMail.getState().messages).map((m) => m.providerId)).toEqual(["b1"]);
    expect(paidBills(useMail.getState().messages).map((m) => m.providerId)).toEqual(["b2"]);
    expect(needsAttention(useMail.getState().messages).some((m) => m.providerId === "b2")).toBe(false);
    await markPaid("acc:b2", false);
    expect(unpaidBills(useMail.getState().messages)).toHaveLength(2);
  });
  it("paid stays paid after the message syncs again", async () => {
    const api = scripted([
      [billMail("b1", { bodyPreview: "due 25 November 2026" })],
      [billMail("b1", { bodyPreview: "due 25 November 2026", isRead: true })],
    ]);
    await syncAccountWith(api, first(), vi.fn());
    await markPaid("acc:b1");
    await syncAccountWith(api, first(), vi.fn());
    expect((await getMessage("acc:b1"))?.paid).toBe(true);
  });
  it("adds the due date to the Calendar and to Tasks, once linked", async () => {
    await syncAccountWith(scripted([[billMail("b1", { bodyPreview: "Amount due $50, due 25 November 2026" })]]), first(), vi.fn());
    const ev = await billToCalendar("acc:b1");
    expect(ev).toMatchObject({ allDay: true, start: "2026-11-25T00:00", end: "2026-11-26T00:00", title: "Pay Energy Co $50" });
    const t = await billToTask("acc:b1");
    expect(t).toMatchObject({ due: "2026-11-25", done: false });
    expect((await getMessage("acc:b1"))?.linked).toEqual({ eventId: ev.id, taskId: t.id });
  });
  it("refuses to add a bill with no due date", async () => {
    await syncAccountWith(scripted([[billMail("b1")]]), first(), vi.fn());
    await expect(billToCalendar("acc:b1")).rejects.toThrow("no due date");
  });
  it("reminds once, before the due date, never for paid or muted bills", async () => {
    const api = scripted([
      [
        billMail("b1", { bodyPreview: "due 12 November 2026" }),
        billMail("b2", { bodyPreview: "due 12 November 2026" }),
        billMail("b3", { bodyPreview: "due 30 December 2026" }),
      ],
    ]);
    await syncAccountWith(api, first(), vi.fn());
    await markPaid("acc:b2");
    await refreshMail();
    const alert = vi.fn();
    const today = new Date(2026, 10, 10);
    expect(await maybeBillReminders(alert, today)).toBe(1);
    expect(alert.mock.calls[0][1]).toContain("due in 2 days");
    expect(await maybeBillReminders(alert, today)).toBe(0);
  });
  it("is off when the reminder days is 0 or desktop alerts are off", async () => {
    await syncAccountWith(scripted([[billMail("b1", { bodyPreview: "due 11 November 2026" })]]), first(), vi.fn());
    await refreshMail();
    useStore.getState().updateSettings((s) => void (s.mail.bills.remindDays = 0));
    expect(await maybeBillReminders(vi.fn(), new Date(2026, 10, 10))).toBe(0);
  });
});

async function putMessagesForTest() {
  const { putMessages } = await import("./cache");
  await putMessages([mm({ id: "acc:1", providerId: "1" }), mm({ id: "acc:9", providerId: "9" })], true);
}

describe("provider-based sync", () => {
  it("applies read-state changes and removals reported by a provider (IMAP style)", async () => {
    await putMessagesForTest();
    const provider: MailProvider = {
      sync: async () => ({
        upserts: [],
        removedIds: ["acc:9"],
        readStates: [{ id: "acc:1", isRead: true }],
        deltaLink: "42",
        initial: false,
      }),
      bodyText: async () => "",
    };
    await syncAccountWithProvider(provider, ACC, async () => {});
    const all = await allMessages();
    expect(all.find((m) => m.id === "acc:1")?.isRead).toBe(true);
    expect(all.some((m) => m.id === "acc:9")).toBe(false);
    expect(useStore.getState().settings.mail.accounts.find((a) => a.id === "acc")?.deltaLink).toBe("42");
  });
  it("marks a bad password as needing sign-in", async () => {
    const provider: MailProvider = {
      sync: async () => {
        throw new Error("[AUTHENTICATIONFAILED] Invalid credentials");
      },
      bodyText: async () => "",
    };
    await expect(syncAccountWithProvider(provider, ACC, async () => {})).rejects.toThrow();
    expect(useStore.getState().settings.mail.accounts.find((a) => a.id === "acc")?.status).toBe("needs-reconnect");
  });
});
