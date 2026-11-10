import type { MailAddr } from "./types";

/** Header text helpers for providers that hand us raw RFC 5322 headers (Gmail). IMAP is parsed natively in Rust. */

const dec = (bytes: number[], charset: string) => {
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
};

/** Decode RFC 2047 words: `=?UTF-8?B?…?=` and `=?UTF-8?Q?…?=`. Text without them is returned as is. */
export function decodeWords(s: string): string {
  const joined = s.replace(/(\?=)\s+(=\?)/g, "$1$2"); // whitespace between two encoded words is dropped
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) => {
    try {
      if (enc.toLowerCase() === "b") {
        return dec(
          Array.from(atob(text), (c) => c.charCodeAt(0)),
          charset,
        );
      }
      const bytes: number[] = [];
      const t = text.replace(/_/g, " ");
      for (let i = 0; i < t.length; i++) {
        if (t[i] === "=" && /^[0-9a-fA-F]{2}$/.test(t.slice(i + 1, i + 3))) {
          bytes.push(parseInt(t.slice(i + 1, i + 3), 16));
          i += 2;
        } else bytes.push(t.charCodeAt(i));
      }
      return dec(bytes, charset);
    } catch {
      return text;
    }
  });
}

/** `"Sam Jones" <sam@x.com>, other@y.com` → addresses (lower-cased), names decoded. */
export function parseAddrList(value: string | undefined): MailAddr[] {
  if (!value) return [];
  const parts: string[] = [];
  let cur = "";
  let quote = false;
  let angle = false;
  for (const ch of value) {
    if (ch === '"') quote = !quote;
    else if (!quote && ch === "<") angle = true;
    else if (!quote && ch === ">") angle = false;
    if (ch === "," && !quote && !angle) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out: MailAddr[] = [];
  for (const p of parts) {
    const m = p.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    const address = (m ? m[2] : p)
      .trim()
      .replace(/^mailto:/i, "")
      .toLowerCase();
    if (!address.includes("@")) continue;
    const name = m ? decodeWords(m[1].replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1")).trim() : "";
    out.push({ name: name || undefined, address });
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Gmail's `snippet` arrives HTML-escaped. */
export const unescapeSnippet = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
