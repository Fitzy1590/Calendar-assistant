import { notify } from "../platform";
import { toast, useStore } from "../../store";
import { getMessage } from "./cache";
import { newFollowUp } from "./followups";
import { processOutbox, type OutboxItem } from "./outbox";
import { gmailSendFetch, smtpCredsFor, tauriInvoke } from "./providers";
import { msApiFor } from "./microsoft";
import { sendMail } from "./send";

/** Sends what is waiting in the outbox, using the real accounts. Runs every few seconds while the app is open. */

async function sendOne(item: OutboxItem) {
  const account = useStore.getState().settings.mail.accounts.find((a) => a.id === item.draft.accountId);
  if (!account) throw new Error("That account was removed.");
  const original = item.draft.reply ? await getMessage(`${account.id}:${item.draft.reply.providerId}`) : undefined;
  await sendMail(account, item.draft, original, { graph: msApiFor, gmail: gmailSendFetch, invoke: tauriInvoke, smtpCreds: smtpCredsFor });
  if (item.followUpDays) {
    const f = newFollowUp(
      {
        accountId: account.id,
        threadId: item.draft.reply?.threadId,
        to: [...item.draft.to, ...item.draft.cc].map((a) => a.address),
        subject: item.draft.subject,
      },
      item.followUpDays,
    );
    useStore.getState().updateSettings((s) => void s.mail.followUps.push(f));
  }
}

export async function sendDue(now = Date.now()) {
  const r = await processOutbox(sendOne, now);
  for (const i of r.sent) toast(`Sent: ${i.draft.subject || "(no subject)"}`);
  for (const i of r.failed) {
    toast(`Couldn't send “${i.draft.subject || "(no subject)"}”: ${i.error}. It's kept in Outbox.`);
    await notify("Email not sent", `${i.draft.subject || "(no subject)"}: ${i.error}`).catch(() => {});
  }
  return r;
}
