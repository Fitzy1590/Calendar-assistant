import { describe, expect, it } from "vitest";
import { newRule } from "./rules";
import { classify, type ClassifyContext } from "./classify";
import type { RawMail } from "./types";

const ctx = (p: Partial<ClassifyContext> = {}): ClassifyContext => ({
  me: "me@outlook.com",
  contacts: new Set(["mum@family.com"]),
  rules: { actionUrgent: true, contacts: true, financial: true, everything: false },
  ...p,
});
const mail = (p: Partial<RawMail> = {}): RawMail => ({
  id: "a:1",
  accountId: "a",
  providerId: "1",
  threadId: "t",
  subject: "Hello",
  from: { address: "someone@example.com" },
  to: [{ address: "me@outlook.com" }],
  cc: [],
  receivedAt: 0,
  isRead: false,
  preview: "",
  folder: "inbox",
  headers: {},
  ...p,
});

describe("classify", () => {
  it("never treats junk or subscriptions as important, even from a contact asking a question", () => {
    expect(classify(mail({ folder: "junk", subject: "Please reply urgently?" }), ctx()).important).toBe(false);
    const sub = classify(
      mail({ from: { address: "mum@family.com" }, subject: "Weekly digest", headers: { "list-unsubscribe": "<mailto:x>" } }),
      ctx(),
    );
    expect(sub.bucket).toBe("subscriptions");
    expect(sub.important).toBe(false);
  });
  it("spots a newsletter by sender and unsubscribe text", () => {
    const r = classify(mail({ from: { address: "newsletter@shop.com" }, preview: "Big sale! Unsubscribe here" }), ctx());
    expect(r.bucket).toBe("subscriptions");
  });
  it("marks a direct question with a deadline as urgent and important", () => {
    const r = classify(mail({ subject: "Can you confirm the booking today?" }), ctx());
    expect(r.bucket).toBe("urgent");
    expect(r.important).toBe(true);
  });
  it("marks a plain request as action required, not urgent", () => {
    const r = classify(mail({ subject: "Quote", preview: "Could you send me the quote when you get a chance" }), ctx());
    expect(r.bucket).toBe("action");
    expect(r.important).toBe(true);
  });
  it("ignores a request when I'm only on Cc", () => {
    const r = classify(mail({ to: [{ address: "boss@work.com" }], cc: [{ address: "me@outlook.com" }], subject: "Please review?" }), ctx());
    expect(r.bucket).toBe("inbox");
    expect(r.important).toBe(false);
  });
  it("treats mail from a Contact as important, but not their social-site notifications", () => {
    expect(classify(mail({ from: { address: "mum@family.com" }, subject: "Dinner" }), ctx()).important).toBe(true);
    expect(classify(mail({ from: { address: "friends@facebookmail.com" }, subject: "Mum tagged you" }), ctx()).important).toBe(false);
  });
  it("treats a bill that is due as an important financial alert, but a receipt as not important", () => {
    const due = classify(mail({ from: { address: "bills@energy.com" }, subject: "Your bill is overdue" }), ctx());
    expect(due.bucket).toBe("financial");
    expect(due.important).toBe(true);
    const receipt = classify(mail({ from: { address: "orders@shop.com" }, subject: "Receipt for your order" }), ctx());
    expect(receipt.bucket).toBe("financial");
    expect(receipt.important).toBe(false);
  });
  it("respects the rules: each can be switched off", () => {
    const off = ctx({ rules: { actionUrgent: false, contacts: false, financial: false, everything: false } });
    expect(classify(mail({ subject: "Can you confirm today?" }), off).important).toBe(false);
    expect(classify(mail({ from: { address: "mum@family.com" } }), off).important).toBe(false);
  });
  it("'everything' makes personal mail important but still not junk or subscriptions", () => {
    const all = ctx({ rules: { actionUrgent: false, contacts: false, financial: false, everything: true } });
    expect(classify(mail({ subject: "Lunch?", to: [{ address: "x@y.com" }] }), all).important).toBe(true);
    expect(classify(mail({ headers: { "list-id": "<news.x>" } }), all).important).toBe(false);
  });
  it("gives a reason for every sorting decision", () => {
    expect(classify(mail({ headers: { "list-id": "<x>" } }), ctx()).reasons.length).toBeGreaterThan(0);
  });

  describe("your rules, overrides and bills", () => {
    const rule = (p: object) => ({
      id: "r",
      name: "R",
      enabled: true,
      senders: [],
      keywords: [],
      keywordMode: "any" as const,
      important: false,
      notify: false,
      mute: false,
      bill: false,
      ...p,
    });
    it("a rule can make a subscription important and notify", () => {
      const r = classify(
        mail({ from: { address: "newsletter@shop.com" }, headers: { "list-id": "<x>" } }),
        ctx({ userRules: [rule({ senders: ["newsletter@shop.com"], important: true, notify: true })] }),
      );
      expect(r).toMatchObject({ bucket: "subscriptions", important: true, notify: true });
      expect(r.reasons.join()).toContain("Your rule");
    });
    it("a keyword rule matches the subject", () => {
      const r = classify(mail({ subject: "Booking confirmed" }), ctx({ userRules: [rule({ keywords: ["booking"], important: true })] }));
      expect(r.important).toBe(true);
    });
    it("mute beats a Contact", () => {
      const r = classify(
        mail({ from: { address: "mum@family.com" } }),
        ctx({ userRules: [rule({ senders: ["mum@family.com"], mute: true })] }),
      );
      expect(r).toMatchObject({ important: false, notify: false, muted: true });
    });
    it("'just this email' beats rules, both ways", () => {
      const muted = [rule({ senders: ["someone@example.com"], mute: true })];
      expect(classify({ ...mail(), override: { important: true } }, ctx({ userRules: muted })).important).toBe(true);
      expect(classify({ ...mail({ from: { address: "mum@family.com" } }), override: { important: false } }, ctx()).important).toBe(false);
    });
    it("treats a due bill as a bill and reads the amount and due date", () => {
      const r = classify(
        mail({
          from: { address: "bills@energy.com" },
          subject: "Your bill is ready",
          preview: "Amount due $184.20, due 20 November 2026",
          receivedAt: new Date(2026, 10, 10).getTime(),
        }),
        ctx(),
      );
      expect(r).toMatchObject({ bill: true, amount: 184.2, dueDate: "2026-11-20" });
    });
    it("does not treat a receipt as a bill, unless a rule or override says so", () => {
      const receipt = mail({ from: { address: "orders@shop.com" }, subject: "Receipt for your order", preview: "Total $62.00" });
      expect(classify(receipt, ctx()).bill).toBe(false);
      expect(classify(receipt, ctx({ userRules: [rule({ senders: ["orders@shop.com"], bill: true })] })).bill).toBe(true);
      expect(classify({ ...receipt, override: { bill: true } }, ctx()).bill).toBe(true);
    });
    it("lets you say an email that looks like a bill is not one", () => {
      const b = mail({ from: { address: "bills@energy.com" }, subject: "Your bill is ready" });
      expect(classify({ ...b, override: { bill: false } }, ctx()).bill).toBe(false);
    });
  });
});

describe("folders", () => {
  const inFolder = newRule({ senders: ["@energyco.com"], folderId: "f1" });
  const withFolders = (over: Partial<ReturnType<typeof ctx>> = {}) => ({ ...ctx(), userRules: [inFolder], folderIds: ["f1"], ...over });
  it("a rule files the mail", () => {
    expect(classify(mail({ from: { address: "bills@energyco.com" } }), withFolders()).folderId).toBe("f1");
    expect(classify(mail({ from: { address: "x@other.com" } }), withFolders()).folderId).toBeUndefined();
  });
  it("your move by hand wins, and null returns it to the Inbox", () => {
    const energy = mail({ from: { address: "bills@energyco.com" } });
    expect(classify({ ...energy, override: { folderId: "f2" } }, withFolders({ folderIds: ["f1", "f2"] })).folderId).toBe("f2");
    expect(classify({ ...energy, override: { folderId: null } }, withFolders()).folderId).toBeUndefined();
  });
  it("a deleted folder no longer holds mail", () => {
    expect(classify(mail({ from: { address: "bills@energyco.com" } }), withFolders({ folderIds: [] })).folderId).toBeUndefined();
  });
});
