import type { GmailApi } from "./gmail";
import { GMAIL } from "./gmail";
import type { GraphApi } from "./graph";
import { GRAPH } from "./graph";
import { GRAPH_ATTACHMENT_BYTES, ownText, type OutgoingMail } from "./compose";
import type { ImapInvoke } from "./imap";
import { buildRaw, toBase64Url } from "./rfc822";
import type { MailAccountMeta, MailAddr, MailMessage } from "./types";

/**
 * Sending through each kind of account. Every function takes the API it needs as an argument, so they are tested against fakes.
 * Replies keep their thread: Outlook and Gmail thread them for you, and SMTP gets In-Reply-To / References.
 */

const recipient = (a: MailAddr) => ({ emailAddress: { address: a.address, ...(a.name ? { name: a.name } : {}) } });
const fileAttachment = (a: OutgoingMail["attachments"][number]) => ({
  "@odata.type": "#microsoft.graph.fileAttachment",
  name: a.name,
  contentType: a.mime || "application/octet-stream",
  contentBytes: a.data,
});

/** Outlook / Hotmail (Graph, scope Mail.Send). Replies and forwards use Outlook's own actions, which add the quoted original. */
export async function sendGraph(api: GraphApi, d: OutgoingMail): Promise<void> {
  if (d.attachments.reduce((n, a) => n + a.size, 0) > GRAPH_ATTACHMENT_BYTES)
    throw new Error("Outlook accepts attachments up to 3 MB here. Attach a smaller file or share a link instead.");
  const recipients = {
    toRecipients: d.to.map(recipient),
    ccRecipients: d.cc.map(recipient),
    bccRecipients: d.bcc.map(recipient),
  };
  const attachments = d.attachments.map(fileAttachment);
  const post = (url: string, body: unknown) => api(url, { method: "POST", body: JSON.stringify(body) });
  if (d.reply && d.mode !== "new") {
    const action = d.mode === "forward" ? "forward" : d.mode === "replyAll" ? "replyAll" : "reply";
    const url = `${GRAPH}/me/messages/${encodeURIComponent(d.reply.providerId)}/${action}`;
    const comment = ownText(d.body).trim();
    if (action === "forward")
      return void (await post(url, {
        comment,
        toRecipients: recipients.toRecipients,
        message: {
          ...(attachments.length ? { attachments } : {}),
          ccRecipients: recipients.ccRecipients,
          bccRecipients: recipients.bccRecipients,
        },
      }));
    await post(url, { comment, message: { ...recipients, ...(attachments.length ? { attachments } : {}) } });
    return;
  }
  await post(`${GRAPH}/me/sendMail`, {
    message: {
      subject: d.subject,
      body: { contentType: "Text", content: d.body },
      ...recipients,
      ...(attachments.length ? { attachments } : {}),
    },
    saveToSentItems: true,
  });
}

/** Gmail (scope gmail.send). */
export async function sendGmail(api: GmailApi, d: OutgoingMail, from: MailAddr): Promise<void> {
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (d.reply && d.mode !== "new" && d.mode !== "forward") {
    try {
      const o = await api(
        `${GMAIL}/messages/${encodeURIComponent(d.reply.providerId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
      );
      const h: Record<string, string> = {};
      for (const x of o?.payload?.headers ?? []) h[String(x.name).toLowerCase()] = String(x.value);
      inReplyTo = h["message-id"];
      references = [h["references"], h["message-id"]].filter(Boolean).join(" ") || undefined;
    } catch {
      /* threading headers are a nicety: send anyway */
    }
  }
  const raw = toBase64Url(buildRaw(d, { from, inReplyTo, references }));
  await api(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw, ...(d.reply && d.mode !== "new" && d.mode !== "forward" ? { threadId: d.reply.threadId } : {}) }),
  });
}

export interface SmtpCreds {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** A password account (Bigpond, Yahoo, iCloud…) through its outgoing server, sent by the Windows app itself. */
export async function sendSmtp(
  invoke: ImapInvoke,
  creds: SmtpCreds,
  d: OutgoingMail,
  from: MailAddr,
  original?: Pick<MailMessage, "headers">,
): Promise<void> {
  const person = (a: MailAddr) => ({ name: a.name ?? null, address: a.address });
  const messageId = original?.headers["message-id"];
  const refs = [original?.headers["references"], messageId].filter(Boolean).join(" ");
  await invoke("smtp_send", {
    req: {
      ...creds,
      from: person(from),
      to: d.to.map(person),
      cc: d.cc.map(person),
      bcc: d.bcc.map(person),
      subject: d.subject,
      body: d.body.replace(/\r?\n/g, "\r\n"),
      in_reply_to: d.mode === "reply" || d.mode === "replyAll" ? (messageId ?? null) : null,
      references: d.mode === "reply" || d.mode === "replyAll" ? refs || null : null,
      attachments: d.attachments.map((a) => ({ name: a.name, mime: a.mime || "application/octet-stream", data: a.data })),
    },
  });
}

export interface SendDeps {
  graph: (accountId: string) => GraphApi;
  gmail: GmailApi;
  invoke: ImapInvoke;
  smtpCreds: (account: MailAccountMeta) => Promise<SmtpCreds>;
}

/** Send from whichever kind of account this draft belongs to. */
export async function sendMail(
  account: MailAccountMeta,
  d: OutgoingMail,
  original: Pick<MailMessage, "headers"> | undefined,
  deps: SendDeps,
): Promise<void> {
  if (!account.canSend)
    throw new Error("This account hasn't been allowed to send yet. Reconnect it in Settings → Email and accept the permission.");
  const from = { name: account.name && account.name !== account.address ? account.name : undefined, address: account.address };
  if (account.provider === "graph") return sendGraph(deps.graph(account.id), d);
  if (account.provider === "gmail") return sendGmail(deps.gmail, d, from);
  return sendSmtp(deps.invoke, await deps.smtpCreds(account), d, from, original);
}
