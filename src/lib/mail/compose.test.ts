import { describe, expect, it } from "vitest";
import {
  canSendNow,
  checkBeforeSend,
  fillTemplate,
  ownText,
  parseRecipients,
  recipientsFor,
  startCompose,
  subjectFor,
  unresolvedChecks,
  validAddress,
  type OutgoingMail,
} from "./compose";

const msg = {
  accountId: "acc",
  providerId: "p1",
  threadId: "t1",
  from: { name: "Sam Rivera", address: "sam@riveraplumbing.com" },
  to: [{ address: "me@outlook.com" }, { address: "pat@x.com" }],
  cc: [{ address: "lee@y.com" }, { address: "SAM@riveraplumbing.com" }],
  subject: "Booking",
  receivedAt: new Date(2026, 10, 10, 8, 44).getTime(),
  text: "Can you confirm Thursday?\nThanks",
  preview: "",
};
const draft = (p: Partial<OutgoingMail> = {}): OutgoingMail => ({
  id: "d",
  accountId: "acc",
  mode: "reply",
  to: [{ address: "sam@riveraplumbing.com" }],
  cc: [],
  bcc: [],
  subject: "Re: Booking",
  body: "Yes, Thursday works.\n\nOn Tue 10 Nov 2026, 8:44 AM, Sam wrote:\n> Can you confirm?",
  attachments: [],
  ...p,
});

describe("replies and forwards", () => {
  it("prefixes the subject once", () => {
    expect(subjectFor("reply", "Booking")).toBe("Re: Booking");
    expect(subjectFor("reply", "RE: Booking")).toBe("RE: Booking");
    expect(subjectFor("forward", "Booking")).toBe("Fwd: Booking");
    expect(subjectFor("forward", "Fwd: Booking")).toBe("Fwd: Booking");
  });
  it("reply goes to the sender; reply all to everyone except you, once each", () => {
    expect(recipientsFor("reply", msg, "me@outlook.com").to.map((a) => a.address)).toEqual(["sam@riveraplumbing.com"]);
    const all = recipientsFor("replyAll", msg, "ME@outlook.com");
    expect(all.to.map((a) => a.address)).toEqual(["sam@riveraplumbing.com", "pat@x.com"]);
    expect(all.cc.map((a) => a.address)).toEqual(["lee@y.com"]);
    expect(recipientsFor("forward", msg, "me@outlook.com")).toEqual({ to: [], cc: [] });
  });
  it("starts a reply with space to write, the signature, then the quote", () => {
    const d = startCompose("reply", msg, "me@outlook.com", "Luke");
    expect(d.subject).toBe("Re: Booking");
    expect(d.body.startsWith("\n\nLuke\n\nOn ")).toBe(true);
    expect(d.body).toContain("> Can you confirm Thursday?");
    expect(d.reply).toEqual({ providerId: "p1", threadId: "t1" });
    const f = startCompose("forward", msg, "me@outlook.com");
    expect(f.body).toContain("---------- Forwarded message ----------");
    expect(f.body).toContain("Subject: Booking");
  });
  it("ownText is only what you wrote", () => {
    expect(ownText(draft().body).trim()).toBe("Yes, Thursday works.");
  });
});

describe("templates", () => {
  it("fills in names and dates, leaves unknown fill-ins alone", () => {
    const t = fillTemplate(
      { body: "Hi {first name}, see you {date} at {time}. {mystery}" },
      { name: "Sam Rivera", address: "s@x.com" },
      new Date(2026, 10, 12, 9, 30),
    );
    expect(t).toBe("Hi Sam, see you Thursday 12 November at 9:30 AM. {mystery}");
    expect(fillTemplate({ body: "Hi {first name}" })).toBe("Hi there");
  });
});

describe("check before sending", () => {
  it("passes a normal reply", () => {
    const c = checkBeforeSend(draft());
    expect(canSendNow(c)).toBe(true);
    expect(c.some((x) => x.level === "warn")).toBe(false);
  });
  it("blocks with no recipient, a bad address, an empty body or an unresolved [CHECK]", () => {
    expect(canSendNow(checkBeforeSend(draft({ to: [] })))).toBe(false);
    expect(canSendNow(checkBeforeSend(draft({ to: [{ address: "nope" }] })))).toBe(false);
    expect(canSendNow(checkBeforeSend(draft({ body: "\n\nOn Tue, Sam wrote:\n> hi" })))).toBe(false);
    const c = checkBeforeSend(draft({ body: "The price is [CHECK: confirm the $2,400 figure]" }));
    expect(canSendNow(c)).toBe(false);
    expect(unresolvedChecks("a [CHECK: x] b [CHECK: y]")).toEqual(["x", "y"]);
  });
  it("warns about a forgotten attachment, a missing subject and a big audience, but lets you send", () => {
    const c = checkBeforeSend(
      draft({ subject: "", body: "Please see the attached quote.", cc: Array.from({ length: 8 }, (_, i) => ({ address: `p${i}@x.com` })) }),
    );
    expect(canSendNow(c)).toBe(true);
    expect(c.filter((x) => x.level === "warn").length).toBe(3);
    const withFile = checkBeforeSend(
      draft({ body: "See attached.", attachments: [{ name: "a.pdf", mime: "application/pdf", data: "", size: 10 }] }),
    );
    expect(withFile.some((x) => /attachment/.test(x.text))).toBe(false);
  });
  it("blocks attachments over 10 MB", () => {
    expect(canSendNow(checkBeforeSend(draft({ attachments: [{ name: "big", mime: "x", data: "", size: 11 * 1024 * 1024 }] })))).toBe(false);
  });
});

describe("addresses", () => {
  it("validates and parses what is typed", () => {
    expect(validAddress("a@b.co")).toBe(true);
    expect(validAddress("a@b")).toBe(false);
    expect(parseRecipients("Sam <sam@x.com>; pat@y.com").map((a) => a.address)).toEqual(["sam@x.com", "pat@y.com"]);
  });
});
