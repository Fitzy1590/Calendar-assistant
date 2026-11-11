import { describe, expect, it, vi } from "vitest";
import type { OutgoingMail } from "./compose";
import { sendGmail, sendGraph, sendMail, sendSmtp, type SendDeps } from "./send";
import type { MailAccountMeta } from "./types";

const d = (p: Partial<OutgoingMail> = {}): OutgoingMail => ({
  id: "d",
  accountId: "a",
  mode: "reply",
  to: [{ name: "Sam", address: "sam@x.com" }],
  cc: [{ address: "lee@y.com" }],
  bcc: [],
  subject: "Re: Booking",
  body: "Yes, Thursday works.\n\nOn Tue 10 Nov, Sam wrote:\n> Can you confirm?",
  reply: { providerId: "p1", threadId: "t1" },
  attachments: [],
  ...p,
});

describe("Outlook (Graph)", () => {
  it("replies with Outlook's own reply action, sending only what you wrote as the comment", async () => {
    const api = vi.fn().mockResolvedValue(null);
    await sendGraph(api, d());
    const [url, init] = api.mock.calls[0];
    expect(url).toMatch(/\/me\/messages\/p1\/reply$/);
    const body = JSON.parse(init.body);
    expect(body.comment).toBe("Yes, Thursday works.");
    expect(body.message.toRecipients[0].emailAddress.address).toBe("sam@x.com");
    expect(body.message.ccRecipients[0].emailAddress.address).toBe("lee@y.com");
  });
  it("uses replyAll and forward, and sendMail for a new message", async () => {
    const api = vi.fn().mockResolvedValue(null);
    await sendGraph(api, d({ mode: "replyAll" }));
    expect(api.mock.calls[0][0]).toMatch(/\/replyAll$/);
    await sendGraph(api, d({ mode: "forward", to: [{ address: "pat@z.com" }] }));
    expect(api.mock.calls[1][0]).toMatch(/\/forward$/);
    expect(JSON.parse(api.mock.calls[1][1].body).toRecipients[0].emailAddress.address).toBe("pat@z.com");
    await sendGraph(api, d({ mode: "new", reply: undefined, body: "Hi" }));
    expect(api.mock.calls[2][0]).toMatch(/\/me\/sendMail$/);
    expect(JSON.parse(api.mock.calls[2][1].body).message.body).toEqual({ contentType: "Text", content: "Hi" });
  });
  it("attaches files and refuses ones Outlook won't take inline", async () => {
    const api = vi.fn().mockResolvedValue(null);
    await sendGraph(api, d({ attachments: [{ name: "q.pdf", mime: "application/pdf", data: "QUJD", size: 3 }] }));
    expect(JSON.parse(api.mock.calls[0][1].body).message.attachments[0]).toMatchObject({ name: "q.pdf", contentBytes: "QUJD" });
    await expect(sendGraph(api, d({ attachments: [{ name: "big", mime: "x", data: "", size: 4 * 1024 * 1024 }] }))).rejects.toThrow(/3 MB/);
  });
});

describe("Gmail", () => {
  it("sends the encoded message on the same thread, with reply headers from the original", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const api = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("format=metadata"))
        return {
          payload: {
            headers: [
              { name: "Message-ID", value: "<orig@x>" },
              { name: "References", value: "<a@x>" },
            ],
          },
        };
      return {};
    };
    await sendGmail(api, d(), { address: "me@gmail.com" });
    const send = calls.find((c) => c.url.endsWith("/messages/send"))!;
    const body = JSON.parse(String(send.init!.body));
    expect(body.threadId).toBe("t1");
    const raw = atob(body.raw.replace(/-/g, "+").replace(/_/g, "/"));
    expect(raw).toContain("In-Reply-To: <orig@x>");
    expect(raw).toContain("References: <a@x> <orig@x>");
  });
  it("still sends when the original's headers can't be read", async () => {
    const api = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("format=metadata")) throw new Error("Google 500");
      return {};
    });
    await sendGmail(api, d(), { address: "me@gmail.com" });
    expect(api.mock.calls.some((c) => String(c[0]).endsWith("/messages/send"))).toBe(true);
  });
});

describe("SMTP (Bigpond and other password accounts)", () => {
  it("passes the message and reply headers to the native sender", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    await sendSmtp(
      invoke,
      { host: "smtp.telstra.com", port: 465, user: "me@bigpond.com", password: "pw" },
      d(),
      { address: "me@bigpond.com" },
      { headers: { "message-id": "<orig@x>", references: "<a@x>" } },
    );
    const req = invoke.mock.calls[0][1].req;
    expect(invoke.mock.calls[0][0]).toBe("smtp_send");
    expect(req).toMatchObject({ host: "smtp.telstra.com", port: 465, in_reply_to: "<orig@x>", references: "<a@x> <orig@x>" });
    expect(req.to[0]).toEqual({ name: "Sam", address: "sam@x.com" });
  });
  it("does not thread a forward or a new message", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    await sendSmtp(
      invoke,
      { host: "h", port: 587, user: "u", password: "p" },
      d({ mode: "forward" }),
      { address: "me@x.com" },
      { headers: { "message-id": "<o@x>" } },
    );
    expect(invoke.mock.calls[0][1].req.in_reply_to).toBeNull();
  });
});

describe("sendMail", () => {
  const acct = (p: Partial<MailAccountMeta>): MailAccountMeta => ({
    id: "a",
    provider: "graph",
    address: "me@x.com",
    name: "Luke",
    enabled: true,
    status: "ok",
    canSend: true,
    ...p,
  });
  const deps = (): SendDeps & { graph: ReturnType<typeof vi.fn> } => ({
    graph: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(null)),
    gmail: vi.fn().mockResolvedValue({}),
    invoke: vi.fn().mockResolvedValue(undefined),
    smtpCreds: async () => ({ host: "h", port: 465, user: "u", password: "p" }),
  });
  it("refuses an account that hasn't been allowed to send", async () => {
    await expect(sendMail(acct({ canSend: false }), d(), undefined, deps())).rejects.toThrow(/Reconnect/);
  });
  it("picks the right sender for each kind of account", async () => {
    const x = deps();
    await sendMail(acct({ provider: "graph" }), d(), undefined, x);
    expect(x.graph).toHaveBeenCalledWith("a");
    await sendMail(acct({ provider: "imap" }), d(), { headers: {} }, x);
    expect(x.invoke).toHaveBeenCalled();
    await sendMail(acct({ provider: "gmail" }), d(), undefined, x);
    expect(x.gmail).toHaveBeenCalled();
  });
});
