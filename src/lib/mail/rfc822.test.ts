import { describe, expect, it } from "vitest";
import { buildRaw, encodeHeader, formatAddr, toBase64Url } from "./rfc822";
import type { OutgoingMail } from "./compose";

const d = (p: Partial<OutgoingMail> = {}): OutgoingMail => ({
  id: "d",
  accountId: "a",
  mode: "reply",
  to: [{ name: "Sam Rivera", address: "sam@x.com" }],
  cc: [],
  bcc: [],
  subject: "Re: Booking",
  body: "Hello\nWorld café",
  attachments: [],
  ...p,
});
const decode = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)));

describe("building an email", () => {
  it("encodes non-ASCII headers and quotes names", () => {
    expect(encodeHeader("Plain")).toBe("Plain");
    expect(encodeHeader("Café")).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(formatAddr({ name: 'Sam "S" Rivera', address: "s@x.com" })).toBe('"Sam \\"S\\" Rivera" <s@x.com>');
    expect(formatAddr({ address: "a@b.com" })).toBe("a@b.com");
  });
  it("makes a threaded plain-text message", () => {
    const raw = buildRaw(d(), {
      from: { name: "Luke", address: "me@x.com" },
      inReplyTo: "<orig@x>",
      references: "<a@x> <orig@x>",
      now: new Date(Date.UTC(2026, 10, 10, 8, 0)),
    });
    expect(raw).toContain('From: "Luke" <me@x.com>\r\n');
    expect(raw).toContain('To: "Sam Rivera" <sam@x.com>\r\n');
    expect(raw).toContain("Subject: Re: Booking\r\n");
    expect(raw).toContain("In-Reply-To: <orig@x>\r\n");
    expect(raw).toContain("References: <a@x> <orig@x>\r\n");
    expect(raw).toContain("Content-Type: text/plain; charset=UTF-8");
    const body = raw.split("\r\n\r\n")[1];
    expect(decode(body)).toBe("Hello\r\nWorld café");
    expect(raw).not.toMatch(/\nBcc:/);
  });
  it("adds a multipart body with attachments", () => {
    const raw = buildRaw(d({ attachments: [{ name: "quote.pdf", mime: "application/pdf", data: btoa("PDFDATA"), size: 7 }] }), {
      from: { address: "me@x.com" },
      boundary: "BB",
    });
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="BB"');
    expect(raw).toContain('Content-Disposition: attachment; filename="quote.pdf"');
    expect(raw).toContain("--BB--");
    expect(raw).toContain(btoa("PDFDATA"));
  });
  it("includes Bcc only when there is one, and base64url has no padding or +/", () => {
    expect(buildRaw(d({ bcc: [{ address: "b@x.com" }] }), { from: { address: "me@x.com" } })).toContain("Bcc: b@x.com");
    const u = toBase64Url("???>>>~~~\u00e9");
    expect(u).not.toMatch(/[+/=]/);
  });
});
