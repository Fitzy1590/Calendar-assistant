import type { MailMessage } from "./types";

/**
 * Getting an email thread ready to send to an AI: quoted replies and signatures stripped, long numbers (cards, accounts,
 * codes) and link tokens hidden, and only the newest few messages kept. Done on this device; you can read the exact result first.
 */

/** The new text of a message, without the quoted earlier messages or the signature. */
export function stripQuoted(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*>/.test(line)) continue;
    if (/^(On .{5,200} wrote:|-{2,} ?Original Message ?-{2,}|-{5,} Forwarded message -{5,}|From: .+|Sent: .+)\s*$/i.test(line.trim()))
      break;
    if (/^-- ?$/.test(line.trim())) break; // signature marker
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Hide what an assistant never needs to see. */
export function redact(text: string): string {
  return text
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[card number]")
    .replace(/\bBSB[:\s]*\d{3}[- ]?\d{3}\b/gi, "BSB [hidden]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .replace(/(https?:\/\/[^\s?#<>)]+)[?#][^\s<>)]*/g, "$1?…")
    .replace(/\b[A-Za-z0-9]{24,}\b/g, "[code]");
}

export interface ThreadContext {
  text: string; // exactly what is sent
  count: number; // messages included
  hidden: number; // things redacted
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + " …" : s);

/** The newest `keep` messages (oldest first), each trimmed, redacted and clipped. */
export function buildThreadContext(msgs: MailMessage[], me: string, opts: { keep?: number; perMessage?: number } = {}): ThreadContext {
  const keep = opts.keep ?? 3;
  const per = opts.perMessage ?? 1500;
  const chosen = [...msgs].sort((a, b) => a.receivedAt - b.receivedAt).slice(-keep);
  let hidden = 0;
  const parts = chosen.map((m) => {
    const raw = stripQuoted(m.text || m.preview || "");
    const clean = redact(raw);
    if (clean !== raw) hidden += (clean.match(/\[(card number|number|code)\]|BSB \[hidden\]|\?…/g) ?? []).length;
    const who = m.from.address.toLowerCase() === me.toLowerCase() ? "Me" : m.from.name || m.from.address;
    return `From: ${who}\nSubject: ${m.subject}\n\n${clip(clean, per)}`;
  });
  return { text: parts.join("\n\n---\n\n"), count: chosen.length, hidden };
}
