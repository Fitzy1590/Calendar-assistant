import { create } from "zustand";
import { format } from "date-fns";
import { live, useStore } from "../../store";
import { isAndroid, notify } from "../platform";
import { allMessages, deleteMessages, evictOver, getMessage, getMessages, putMessages } from "./cache";
import { classify, type ClassifyContext } from "./classify";
import { syncInbox, type GraphApi } from "./graph";
import { msApiFor } from "./microsoft";
import type { MailAccountMeta, MailMessage, RawMail } from "./types";

/** Sync every connected account, sort the mail, and raise alerts for new important mail. Windows app / browser only. */

export const useMail = create<{ messages: MailMessage[]; syncing: boolean; error?: string; selectedId?: string }>(() => ({
  messages: [],
  syncing: false,
}));

/** Important, unread and not dismissed here: what the Home card, the badge and alerts are about. */
export const needsAttention = (msgs: MailMessage[]) => msgs.filter((m) => m.important && !m.isRead && !m.dismissed);

export async function refreshMail() {
  useMail.setState({ messages: await allMessages() });
}

/** Up to 3 individual alerts; more become one summary. Pure. */
export function planAlerts(fresh: MailMessage[]): { title: string; body: string }[] {
  if (!fresh.length) return [];
  const who = (m: MailMessage) => m.from.name || m.from.address;
  if (fresh.length <= 3) return fresh.map((m) => ({ title: `Important email from ${who(m)}`, body: m.subject }));
  return [
    {
      title: `${fresh.length} new important emails`,
      body: fresh
        .slice(0, 3)
        .map((m) => `${who(m)}: ${m.subject}`)
        .join("\n"),
    },
  ];
}

/** The once-a-day summary, or null when there's nothing to say. Pure. */
export function digestText(msgs: MailMessage[]): { title: string; body: string } | null {
  const n = needsAttention(msgs);
  if (!n.length) return null;
  const top = n.slice(0, 3).map((m) => `${m.from.name || m.from.address}: ${m.subject}`);
  return {
    title: `Email: ${n.length} need${n.length === 1 ? "s" : ""} your attention`,
    body: top.join("\n") + (n.length > 3 ? `\n…and ${n.length - 3} more` : ""),
  };
}

const contactSet = () => new Set(live(useStore.getState().contacts).flatMap((c) => (c.email ? [c.email.toLowerCase()] : [])));
const ctxFor = (me: string): ClassifyContext => ({ me, contacts: contactSet(), rules: useStore.getState().settings.mail.important });

/** Sort a raw message, keeping what only this device knows about it (text, dismissed). */
export const sortMail = (raw: RawMail, ctx: ClassifyContext, old?: MailMessage): MailMessage => ({
  ...raw,
  ...classify(raw, ctx),
  text: old?.text,
  dismissed: old?.dismissed,
});

type Notifier = (title: string, body: string) => void | Promise<void>;

/** Sync one account against `api`. Returns the new important messages that were alerted. Exported for tests. */
export async function syncAccountWith(api: GraphApi, account: MailAccountMeta, alert: Notifier = notify): Promise<MailMessage[]> {
  const settings = useStore.getState().settings.mail;
  try {
    const r = await syncInbox(api, account);
    const old = await getMessages(r.upserts.map((m) => m.id));
    const ctx = ctxFor(account.address);
    const sorted = r.upserts.map((m) => sortMail(m, ctx, old.get(m.id)));
    await putMessages(sorted, settings.cacheText);
    await deleteMessages(r.removedIds);
    await evictOver(settings.cacheMaxMB * 1024 * 1024);
    // alert only for mail that arrived since last time, never for the first sync's backlog or for edits to old mail
    const fresh = r.initial ? [] : needsAttention(sorted.filter((m) => !old.has(m.id)));
    useStore.getState().updateSettings((s) => {
      const a = s.mail.accounts.find((x) => x.id === account.id);
      if (a) Object.assign(a, { deltaLink: r.deltaLink, lastSyncAt: Date.now(), status: "ok", error: undefined });
    });
    if (fresh.length && settings.alerts.desktop) for (const p of planAlerts(fresh)) await alert(p.title, p.body);
    return fresh;
  } catch (e) {
    const msg = (e as Error).message;
    const lost = /invalid_grant|Graph 401|AADSTS/i.test(msg);
    useStore.getState().updateSettings((s) => {
      const a = s.mail.accounts.find((x) => x.id === account.id);
      if (a)
        Object.assign(a, {
          status: lost ? "needs-reconnect" : "error",
          error: lost ? "Sign in to this account again." : msg.slice(0, 200),
        });
    });
    throw e;
  }
}

/** Hide a message from the Home card and alerts (this device only; Outlook is not changed). */
export async function dismissMail(id: string) {
  const m = await getMessage(id);
  if (m && !m.dismissed) {
    await putMessages([{ ...m, dismissed: true }], useStore.getState().settings.mail.cacheText);
    await refreshMail();
  }
}

/** Re-sort cached mail after the rules or Contacts change (no network). */
export async function reclassifyCached() {
  const all = await allMessages();
  const accounts = useStore.getState().settings.mail.accounts;
  const out = all.map((m) => sortMail(m, ctxFor(accounts.find((a) => a.id === m.accountId)?.address ?? ""), m));
  await putMessages(out, useStore.getState().settings.mail.cacheText);
  await refreshMail();
}

/** Send the morning summary once a day, after the chosen hour. */
export async function maybeDailyDigest(now = new Date(), alert: Notifier = notify): Promise<boolean> {
  const m = useStore.getState().settings.mail;
  const today = format(now, "yyyy-MM-dd");
  if (!m.alerts.dailySummary || !m.accounts.length || m.lastDigestOn === today || now.getHours() < m.alerts.summaryHour) return false;
  const text = digestText(useMail.getState().messages);
  useStore.getState().updateSettings((s) => void (s.mail.lastDigestOn = today));
  if (!text) return false;
  await alert(text.title, text.body);
  return true;
}

let inflight: Promise<string> | null = null;

/** Sync all enabled accounts. One run at a time. */
export function syncMail(): Promise<string> {
  inflight ??= (async () => {
    const accounts = useStore.getState().settings.mail.accounts.filter((a) => a.enabled);
    if (!accounts.length) return "No email accounts connected.";
    useMail.setState({ syncing: true, error: undefined });
    let failed = 0;
    let fresh = 0;
    for (const a of accounts) {
      try {
        fresh += (await syncAccountWith(msApiFor(a.id), a)).length;
      } catch (e) {
        failed++;
        useMail.setState({ error: `${a.address}: ${(e as Error).message.slice(0, 120)}` });
      }
    }
    await refreshMail();
    await maybeDailyDigest().catch(() => {});
    useMail.setState({ syncing: false });
    return failed ? `${failed} account(s) couldn't sync.` : `Email synced${fresh ? `: ${fresh} new important` : ""}.`;
  })().finally(() => (inflight = null));
  return inflight;
}

/** Start background sync: when the app opens, when its window returns, and every `pollMins`. Returns the cleanup. */
export function startMailPolling(): () => void {
  if (isAndroid()) return () => {};
  let last = 0;
  const run = (onOpen = false) => {
    const m = useStore.getState().settings.mail;
    if (!m.accounts.some((a) => a.enabled && a.status !== "needs-reconnect")) return;
    if (Date.now() - last < (onOpen ? 60_000 : m.pollMins * 60_000)) return;
    last = Date.now();
    syncMail().catch(() => {});
  };
  refreshMail().catch(() => {});
  run(true);
  const timer = setInterval(() => run(), 30_000);
  const onFocus = () => run(true);
  const onVisible = () => document.visibilityState === "visible" && run(true);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
