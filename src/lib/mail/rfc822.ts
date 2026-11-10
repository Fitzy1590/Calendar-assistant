import type { MailAddr } from "./types";
import type { OutgoingMail } from "./compose";

/** Builds a plain email message (RFC 5322 / MIME) for providers that take the raw text (Gmail). */

const CRLF = "\r\n";
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const wrap76 = (s: string) => s.replace(/(.{76})/g, `$1${CRLF}`).replace(new RegExp(`${CRLF}$`), "");

/** `=?UTF-8?B?…?=` for anything that isn't plain ASCII. Long values are split so no line passes 75 characters. */
export function encodeHeader(value: string): string {
  if (ascii(value)) return value;
  const words: string[] = [];
  let cur = "";
  for (const ch of value) {
    if (new TextEncoder().encode(cur + ch).length > 40) {
      words.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64(w)}?=`).join(`${CRLF} `);
}

export function formatAddr(a: MailAddr): string {
  if (!a.name) return a.address;
  const name = ascii(a.name) ? `"${a.name.replace(/(["\\])/g, "\\$1")}"` : encodeHeader(a.name);
  return `${name} <${a.address}>`;
}

const list = (l: MailAddr[]) => l.map(formatAddr).join(", ");

export interface RawOptions {
  from: MailAddr;
  inReplyTo?: string;
  references?: string;
  now?: Date;
  boundary?: string;
}

export function buildRaw(d: OutgoingMail, o: RawOptions): string {
  const now = o.now ?? new Date();
  const id = `<${crypto.randomUUID()}@calendar-assistant.local>`;
  const boundary = o.boundary ?? "ca-" + crypto.randomUUID().replace(/-/g, "");
  const head = [
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `From: ${formatAddr(o.from)}`,
    d.to.length ? `To: ${list(d.to)}` : "",
    d.cc.length ? `Cc: ${list(d.cc)}` : "",
    d.bcc.length ? `Bcc: ${list(d.bcc)}` : "",
    `Subject: ${encodeHeader(d.subject)}`,
    `Message-ID: ${id}`,
    o.inReplyTo ? `In-Reply-To: ${o.inReplyTo}` : "",
    o.references ? `References: ${o.references}` : "",
    "MIME-Version: 1.0",
  ].filter(Boolean);
  const text = [
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    "",
    wrap76(b64(d.body.replace(/\r?\n/g, CRLF))),
  ].join(CRLF);
  if (!d.attachments.length) return head.join(CRLF) + CRLF + text + CRLF;
  const parts = [`--${boundary}`, text];
  for (const a of d.attachments) {
    const name = encodeHeader(a.name);
    parts.push(
      `--${boundary}`,
      [
        `Content-Type: ${a.mime || "application/octet-stream"}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`,
        `Content-Transfer-Encoding: base64`,
        "",
        wrap76(a.data),
      ].join(CRLF),
    );
  }
  parts.push(`--${boundary}--`);
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", parts.join(CRLF)].join(CRLF) + CRLF;
}

/** Gmail wants the whole message base64url-encoded. */
export const toBase64Url = (raw: string) => b64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
