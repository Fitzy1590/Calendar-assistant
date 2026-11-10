import { describe, expect, it } from "vitest";
import {
  applyRules,
  describeRule,
  matchRule,
  newRule,
  parseList,
  recordOverride,
  ruleForFolder,
  ruleForSender,
  senderMatches,
  suggestion,
  validateRule,
} from "./rules";

const m = (address: string, subject = "Hello") => ({ from: { address }, subject });

describe("sender matching", () => {
  it("matches an address exactly, case-insensitively", () => {
    expect(senderMatches("Sam@Plumb.com", "sam@plumb.com")).toBe(true);
    expect(senderMatches("sam@plumb.com", "pat@plumb.com")).toBe(false);
  });
  it("matches a whole domain with or without @, including subdomains, but not look-alikes", () => {
    expect(senderMatches("@energyco.com", "bills@energyco.com")).toBe(true);
    expect(senderMatches("energyco.com", "no-reply@mail.energyco.com")).toBe(true);
    expect(senderMatches("energyco.com", "x@notenergyco.com")).toBe(false);
  });
});

describe("rule matching", () => {
  const base = { senders: [], keywords: [], keywordMode: "any" as const };
  it("an empty rule matches nothing", () => {
    expect(matchRule(base, m("a@b.com"))).toBe(false);
  });
  it("keywords: any or all, in the subject only", () => {
    const any = { ...base, keywords: ["invoice", "booking"] };
    expect(matchRule(any, m("a@b.com", "Your BOOKING is confirmed"))).toBe(true);
    expect(matchRule({ ...any, keywordMode: "all" }, m("a@b.com", "Booking invoice"))).toBe(true);
    expect(matchRule({ ...any, keywordMode: "all" }, m("a@b.com", "Booking only"))).toBe(false);
  });
  it("sender and keywords must both match when both are given", () => {
    const r = { ...base, senders: ["@energyco.com"], keywords: ["bill"] };
    expect(matchRule(r, m("x@energyco.com", "Your bill"))).toBe(true);
    expect(matchRule(r, m("x@energyco.com", "Newsletter"))).toBe(false);
    expect(matchRule(r, m("x@other.com", "Your bill"))).toBe(false);
  });
});

describe("applying rules", () => {
  const rule = (p: object) => newRule({ senders: ["a@b.com"], ...p });
  it("combines actions from every matching rule, and ignores switched-off rules", () => {
    const fx = applyRules([rule({ important: true }), rule({ bill: true }), rule({ notify: true, enabled: false })], m("a@b.com"));
    expect(fx).toMatchObject({ important: true, bill: true, notify: false, muted: false });
  });
  it("mute beats important and notify", () => {
    const fx = applyRules([rule({ important: true, notify: true }), rule({ mute: true })], m("a@b.com"));
    expect(fx).toMatchObject({ important: false, notify: false, muted: true });
  });
});

describe("making rules", () => {
  it("builds a sender rule from an email and reuses it the second time", () => {
    const a = ruleForSender([], { from: { name: "Sam", address: "Sam@X.com" } }, "important");
    expect(a.created).toBe(true);
    expect(a.rule).toMatchObject({ senders: ["sam@x.com"], important: true, notify: true, mute: false });
    const b = ruleForSender([a.rule], { from: { address: "sam@x.com" } }, "important");
    expect(b.created).toBe(false);
    expect(b.rule.id).toBe(a.rule.id);
  });
  it("validates: needs a sender or keyword, an action, and no mute with important", () => {
    expect(validateRule(newRule())).toHaveLength(2);
    expect(validateRule(newRule({ senders: ["a@b.com"], mute: true, important: true }))).toEqual([
      "Mute can't be combined with Important or Always notify.",
    ]);
    expect(validateRule(newRule({ keywords: ["x"], bill: true }))).toEqual([]);
  });
  it("describes a rule in plain words", () => {
    expect(describeRule(newRule({ senders: ["@energyco.com"], keywords: ["bill", "invoice"], important: true, bill: true }))).toBe(
      "From @energyco.com, subject has “bill” or “invoice” → Important + Bills",
    );
  });
  it("splits a typed list", () => {
    expect(parseList("a@b.com, @c.com\nd.com; a@b.com")).toEqual(["a@b.com", "@c.com", "d.com"]);
  });
});

describe("suggestions", () => {
  const empty = { counts: {}, dismissed: [] as string[] };
  it("suggests a rule after the same change three times, unless one exists or it was dismissed", () => {
    let s = empty;
    for (let i = 0; i < 2; i++) s = recordOverride(s, "Sam@x.com", "important");
    expect(suggestion(s, [], "sam@x.com")).toBeNull();
    s = recordOverride(s, "sam@x.com", "important");
    expect(suggestion(s, [], "SAM@x.com")).toBe("important");
    expect(suggestion(s, [newRule({ senders: ["sam@x.com"], important: true })], "sam@x.com")).toBeNull();
    expect(suggestion({ ...s, dismissed: ["sam@x.com"] }, [], "sam@x.com")).toBeNull();
  });
});

describe("rules that file mail in a folder", () => {
  const folder = { id: "f1", name: "Energy" };
  it("applyRules reports the folder of the first matching rule that has one", () => {
    const a = newRule({ senders: ["@energyco.com"], folderId: "f1" });
    const b = newRule({ senders: ["bills@energyco.com"], folderId: "f2" });
    expect(applyRules([a, b], m("bills@energyco.com")).folderId).toBe("f1");
    expect(applyRules([a], m("x@other.com")).folderId).toBeUndefined();
    expect(applyRules([{ ...a, enabled: false }], m("bills@energyco.com")).folderId).toBeUndefined();
  });
  it("makes a rule for the sender or for everyone at the domain", () => {
    const msg = { from: { name: "Energy Co", address: "Bills@EnergyCo.com" } };
    const s = ruleForFolder([], msg, folder);
    expect(s.senders).toEqual(["bills@energyco.com"]);
    expect(s.folderId).toBe("f1");
    expect(s.name).toBe("Energy Co → Energy");
    expect(ruleForFolder([], msg, folder, "domain").senders).toEqual(["@energyco.com"]);
  });
  it("updates an existing plain rule for the same sender instead of adding another", () => {
    const have = newRule({ senders: ["bills@energyco.com"], important: true });
    const r = ruleForFolder([have], { from: { address: "bills@energyco.com" } }, folder);
    expect(r.id).toBe(have.id);
    expect(r.important).toBe(true);
    expect(r.folderId).toBe("f1");
  });
  it("describes the folder in the rule summary", () => {
    expect(describeRule(newRule({ senders: ["a@b.com"], folderId: "f1" }), [folder])).toContain("Folder “Energy”");
  });
});
