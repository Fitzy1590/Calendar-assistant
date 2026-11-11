import type { OutgoingMail } from "./compose";
import type { MailMessage } from "./types";

/** The List-Unsubscribe header newsletters carry: a web page and/or an address to email. Pure. */

export interface UnsubscribeOptions {
  web?: string; // an https page that unsubscribes (or asks you to confirm)
  mailto?: { to: string; subject: string; body: string };
}

export function parseUnsubscribe(header: string | undefined): UnsubscribeOptions | null {
  if (!header) return null;
  const out: UnsubscribeOptions = {};
  for (const m of header.matchAll(/<([^>]+)>/g)) {
    const v = m[1].trim();
    if (/^https:\/\//i.test(v) && !out.web) out.web = v;
    else if (/^mailto:/i.test(v) && !out.mailto) {
      const [addr, query = ""] = v.slice(7).split("?");
      const q = new URLSearchParams(query);
      const to = decodeURIComponent(addr).trim();
      if (/^[^\s@]+@[^\s@]+$/.test(to))
        out.mailto = {
          to,
          subject: q.get("subject") ?? "Unsubscribe",
          body: q.get("body") ?? "Please unsubscribe me from this mailing list.",
        };
    }
  }
  return out.web || out.mailto ? out : null;
}

export const unsubscribeFor = (m: Pick<MailMessage, "headers">) => parseUnsubscribe(m.headers["list-unsubscribe"]);

/** An email to the list's unsubscribe address. It opens in the compose window; nothing is sent until you press Send. */
export function unsubscribeDraft(o: UnsubscribeOptions, accountId: string): OutgoingMail | null {
  if (!o.mailto) return null;
  return {
    id: crypto.randomUUID().slice(0, 10),
    accountId,
    mode: "new",
    to: [{ address: o.mailto.to }],
    cc: [],
    bcc: [],
    subject: o.mailto.subject,
    body: o.mailto.body,
    attachments: [],
  };
}
