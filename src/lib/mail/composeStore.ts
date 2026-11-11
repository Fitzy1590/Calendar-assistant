import { create } from "zustand";
import { useStore } from "../../store";
import type { AiProvider } from "./ai";
import { startCompose, startNew, withDraft, type ComposeMode, type OutgoingMail } from "./compose";
import type { MailMessage } from "./types";

/** Which compose window is open (one at a time, from anywhere in the app). */
export const useCompose = create<{ draft: OutgoingMail | null; autoDraft?: AiProvider }>(() => ({ draft: null }));

export const openCompose = (draft: OutgoingMail, autoDraft?: AiProvider) => useCompose.setState({ draft, autoDraft });
export const closeCompose = () => useCompose.setState({ draft: null, autoDraft: undefined });

const accountFor = (m: Pick<MailMessage, "accountId">) => useStore.getState().settings.mail.accounts.find((a) => a.id === m.accountId);

/** Reply, reply all or forward this message, with your signature and the quoted original. `text` pre-fills the reply. */
export function replyTo(mode: Exclude<ComposeMode, "new">, m: MailMessage, opts: { text?: string; ai?: AiProvider } = {}) {
  const acct = accountFor(m);
  const sig = useStore.getState().settings.mail.signatures[m.accountId] ?? "";
  const d = startCompose(mode, m, acct?.address ?? "", sig);
  if (opts.text) d.body = withDraft(d.body, opts.text, sig);
  openCompose(d, opts.ai);
}

export function newMail(accountId?: string) {
  const mail = useStore.getState().settings.mail;
  const id = accountId ?? mail.accounts.find((a) => a.canSend)?.id ?? mail.accounts[0]?.id;
  if (!id) return;
  openCompose(startNew(id, mail.signatures[id] ?? ""));
}
