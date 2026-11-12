import { create } from "zustand";
import { format } from "date-fns";
import { live, useStore } from "../../store";
import { addDays, format as fmt, parse as parseD } from "date-fns";
import { notify } from "../platform";
import { dueLabel, dueState, money } from "./bills";
import { allMessages, deleteMessages, evictOver, getMessage, getMessages, putMessages } from "./cache";
import { classify, type ClassifyContext } from "./classify";
import { checkFollowUps, dueSnoozes, isSnoozed } from "./followups";
import { graphProvider, type GraphApi } from "./graph";
import type { MailProvider } from "./provider";
import { providerFor } from "./providers";
import { sendDue } from "./sender";
import { recordOverride, ruleForFolder, ruleForSender, type SenderAction } from "./rules";
import type { MailAccountMeta, MailFolder, MailMessage, MailRule, RawMail } from "./types";

/** Sync every connected account, sort the mail, and raise alerts for new important mail. Windows app / browser only. */

export const useMail = create<{ messages: MailMessage[]; syncing: boolean; error?: string; selectedId?: string; tab: "mail" | "bills" }>(
  () => ({
    messages: [],
    syncing: false,
    tab: "mail",
  }),
);

/** Important, unread and not dismissed here: what the Home card, the badge and alerts are about. */
export const needsAttention = (msgs: MailMessage[]) =>
  msgs.filter((m) => m.important && !m.isRead && !m.dismissed && !m.paid && !m.muted && !isSnoozed(m));

/** Worth a desktop notification when it arrives: important, or one of your "always notify" rules. */
export const shouldAlert = (m: MailMessage) =>
  !m.muted && !m.paid && !m.isRead && !m.dismissed && !isSnoozed(m) && (m.important || !!m.notify);

/** Unpaid bills, soonest due first (no due date last). */
export const unpaidBills = (msgs: MailMessage[]) =>
  msgs
    .filter((m) => m.bill && !m.paid)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.receivedAt - a.receivedAt);
export const paidBills = (msgs: MailMessage[]) => msgs.filter((m) => m.bill && m.paid).sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));

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
const ctxFor = (me: string): ClassifyContext => ({
  me,
  contacts: contactSet(),
  rules: useStore.getState().settings.mail.important,
  userRules: useStore.getState().settings.mail.rules,
  folderIds: useStore.getState().settings.mail.folders.map((f) => f.id),
});

/** Sort a raw message, keeping what only this device knows about it (text, dismissed). */
export const sortMail = (raw: RawMail, ctx: ClassifyContext, old?: MailMessage): MailMessage => ({
  ...raw,
  ...classify({ ...raw, override: old?.override, text: old?.text }, ctx),
  text: old?.text,
  dismissed: old?.dismissed,
  paid: old?.paid,
  paidAt: old?.paidAt,
  override: old?.override,
  linked: old?.linked,
  reminded: old?.reminded,
});

type Notifier = (title: string, body: string) => void | Promise<void>;

/** Mail alerts are silent unless you turned the sound on (Settings → Email). */
const mailNotify: Notifier = (title, body) => notify(title, body, { silent: !useStore.getState().settings.mail.alerts.sound });

/** Graph shortcut kept for tests. */
export const syncAccountWith = (api: GraphApi, account: MailAccountMeta, alert: Notifier = mailNotify) =>
  syncAccountWithProvider(graphProvider(api), account, alert);

/** Sync one account through its provider. Returns the new important messages that were alerted. Exported for tests. */
export async function syncAccountWithProvider(
  provider: MailProvider,
  account: MailAccountMeta,
  alert: Notifier = mailNotify,
): Promise<MailMessage[]> {
  const settings = useStore.getState().settings.mail;
  try {
    const r = await provider.sync(account);
    const old = await getMessages(r.upserts.map((m) => m.id));
    const ctx = ctxFor(account.address);
    const sorted = r.upserts.map((m) => sortMail(m, ctx, old.get(m.id)));
    // bills: read the email itself for the amount and due date (a few per sync; a failure just leaves them blank)
    for (const [i, m] of sorted.entries()) {
      if (!m.bill || m.text || (m.amount !== undefined && m.dueDate)) continue;
      if (sorted.slice(0, i).filter((x) => x.bill).length >= 10) break;
      try {
        const text = await provider.bodyText(m.providerId);
        if (text) sorted[i] = sortMail(m, ctx, { ...m, text });
      } catch {
        /* keep going */
      }
    }
    await putMessages(sorted, settings.cacheText);
    await deleteMessages(r.removedIds);
    if (r.readStates?.length) {
      const have = await getMessages(r.readStates.map((x) => x.id));
      const changed = r.readStates.flatMap((x) => {
        const m = have.get(x.id);
        return m && m.isRead !== x.isRead ? [{ ...m, isRead: x.isRead }] : [];
      });
      if (changed.length) await putMessages(changed, settings.cacheText);
    }
    await evictOver(settings.cacheMaxMB * 1024 * 1024);
    // alert only for mail that arrived since last time, never for the first sync's backlog or for edits to old mail
    const fresh = r.initial ? [] : sorted.filter((m) => !old.has(m.id)).filter(shouldAlert);
    useStore.getState().updateSettings((s) => {
      const a = s.mail.accounts.find((x) => x.id === account.id);
      if (a) Object.assign(a, { deltaLink: r.deltaLink, lastSyncAt: Date.now(), status: "ok", error: undefined });
    });
    if (fresh.length && settings.alerts.desktop) for (const p of planAlerts(fresh)) await alert(p.title, p.body);
    return fresh;
  } catch (e) {
    const msg = (e as Error).message;
    const lost =
      /invalid_grant|Graph 401|Google 401|AADSTS|AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|authentication failed/i.test(msg);
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
export async function maybeDailyDigest(now = new Date(), alert: Notifier = mailNotify): Promise<boolean> {
  const m = useStore.getState().settings.mail;
  const today = format(now, "yyyy-MM-dd");
  if (!m.alerts.dailySummary || !m.accounts.length || m.lastDigestOn === today || now.getHours() < m.alerts.summaryHour) return false;
  const text = digestText(useMail.getState().messages);
  useStore.getState().updateSettings((s) => void (s.mail.lastDigestOn = today));
  if (!text) return false;
  await alert(text.title, text.body);
  return true;
}

/* ---------- rules, overrides, bills ---------- */

const mailSettings = () => useStore.getState().settings.mail;
const keepText = () => mailSettings().cacheText;

async function updateOne(id: string, patch: (m: MailMessage) => MailMessage): Promise<MailMessage | undefined> {
  const m = await getMessage(id);
  if (!m) return undefined;
  const next = patch(m);
  await putMessages([next], keepText());
  await refreshMail();
  return next;
}

/** Re-sort one message after a change to its override. */
const resort = (m: MailMessage): MailMessage =>
  sortMail(m, ctxFor(mailSettings().accounts.find((a) => a.id === m.accountId)?.address ?? ""), m);

/** Mark a bill paid (or undo): it leaves Home and alerts, and moves to the Paid list. */
export const markPaid = (id: string, paid = true) =>
  updateOne(id, (m) => ({ ...m, paid, paidAt: paid ? Date.now() : undefined, dismissed: paid ? true : m.dismissed }));

/** "Just this email": change how one message is handled. `undefined` clears that setting. */
export async function setOverride(id: string, patch: { important?: boolean | null; bill?: boolean | null }) {
  const next = await updateOne(id, (m) => {
    const o: Record<string, unknown> = { ...(m.override ?? {}) };
    for (const [k, v] of Object.entries(patch) as [string, boolean | null][]) {
      if (v === null) delete o[k];
      else o[k] = v;
    }
    return resort({ ...m, override: Object.keys(o).length ? (o as MailMessage["override"]) : undefined });
  });
  if (next) {
    const kind: SenderAction | null =
      patch.important === true ? "important" : patch.important === false ? "mute" : patch.bill === true ? "bill" : null;
    if (kind) useStore.getState().updateSettings((s) => void (s.mail.suggest = recordOverride(s.mail.suggest, next.from.address, kind)));
  }
  return next;
}

/** Save a rule (new or edited) and re-sort what's cached. */
export async function saveRule(rule: MailRule) {
  useStore.getState().updateSettings((s) => {
    const i = s.mail.rules.findIndex((r) => r.id === rule.id);
    if (i >= 0) s.mail.rules[i] = rule;
    else s.mail.rules.push(rule);
  });
  await reclassifyCached();
}

export async function deleteRule(id: string) {
  useStore.getState().updateSettings((s) => void (s.mail.rules = s.mail.rules.filter((r) => r.id !== id)));
  await reclassifyCached();
}

/** One click from an email: a rule for everything from this sender. */
export async function addSenderRule(m: MailMessage, action: SenderAction) {
  const res = ruleForSender(mailSettings().rules, m, action);
  await saveRule(res.rule);
  return res;
}

/* ---------- snooze, follow-ups and the background tick ---------- */

/** Hide an email until `at` (this device only). */
export const snoozeMail = (id: string, at: number) => updateOne(id, (m) => ({ ...m, snoozedUntil: at }));
export const unsnoozeMail = (id: string) => updateOne(id, (m) => ({ ...m, snoozedUntil: undefined }));

/** Snoozed mail whose time has come comes back as unread with an alert; follow-ups with no reply raise a reminder. */
export async function wakeAndRemind(alert: Notifier = mailNotify, now = Date.now()) {
  const all = await allMessages();
  const due = dueSnoozes(all, now);
  if (due.length) {
    await putMessages(
      due.map((m) => ({ ...m, snoozedUntil: undefined, isRead: false, dismissed: false })),
      keepText(),
    );
    await refreshMail();
    for (const m of due.slice(0, 3)) await alert("Snoozed email is back", `${m.from.name || m.from.address}: ${m.subject}`);
  }
  const list = mailSettings().followUps;
  if (list.length) {
    const { answered, overdue } = checkFollowUps(list, all, now);
    for (const f of overdue.slice(0, 3))
      await alert("No reply yet", `${f.subject} (sent ${Math.max(1, Math.round((now - f.sentAt) / 864e5))} days ago)`);
    const done = new Set([...answered, ...overdue].map((f) => f.id));
    if (done.size) useStore.getState().updateSettings((s) => void (s.mail.followUps = s.mail.followUps.filter((f) => !done.has(f.id))));
  }
}

/* ---------- folders (in this app only; your mailbox is not changed) ---------- */

/** The folder with this name (any capitals), or a new one. */
export function createFolder(name: string): MailFolder {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new Error("Give the folder a name.");
  const have = mailSettings().folders.find((f) => f.name.toLowerCase() === clean.toLowerCase());
  if (have) return have;
  const folder = { id: crypto.randomUUID().slice(0, 8), name: clean };
  useStore.getState().updateSettings((s) => void s.mail.folders.push(folder));
  return folder;
}

export async function renameFolder(id: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  useStore.getState().updateSettings((s) => {
    const f = s.mail.folders.find((x) => x.id === id);
    if (f) f.name = clean;
  });
}

/** Delete a folder: its mail goes back to the Inbox views, and rules that filed into it stop filing. Nothing in your mailbox is touched. */
export async function deleteFolder(id: string) {
  useStore.getState().updateSettings((s) => {
    s.mail.folders = s.mail.folders.filter((f) => f.id !== id);
    for (const r of s.mail.rules) if (r.folderId === id) r.folderId = undefined;
  });
  await reclassifyCached();
}

/** Put one email in a folder by hand (`null` = back to the Inbox). */
export async function moveToFolder(id: string, folderId: string | null) {
  return updateOne(id, (m) => resort({ ...m, override: { ...(m.override ?? {}), folderId } }));
}

/** One step from a right-click: make (or reuse) the folder, add the rule for this sender or domain, and file the mail already here. */
export async function createRuleAndFolder(m: MailMessage, folderName: string, scope: "sender" | "domain" = "sender") {
  const folder = createFolder(folderName);
  const rule = ruleForFolder(mailSettings().rules, m, folder, scope);
  await saveRule(rule);
  return { folder, rule };
}

export const dismissSuggestion = (address: string) =>
  useStore.getState().updateSettings((s) => void s.mail.suggest.dismissed.push(address.toLowerCase()));

const billTitle = (m: MailMessage) => `Pay ${m.from.name || m.from.address}${m.amount ? ` ${money(m.amount)}` : ""}`;

/** Add a bill's due date to the Calendar (an all-day event). */
export async function billToCalendar(id: string) {
  const m = await getMessage(id);
  if (!m?.dueDate) throw new Error("This bill has no due date to add.");
  const st = useStore.getState();
  const ev = st.upsert("events", {
    title: billTitle(m),
    start: `${m.dueDate}T00:00`,
    end: `${fmt(addDays(parseD(m.dueDate, "yyyy-MM-dd", new Date()), 1), "yyyy-MM-dd")}T00:00`,
    allDay: true,
    notes: `From ${m.from.name || m.from.address}: ${m.subject}`,
    source: "email",
    reminderMins: [st.settings.reminders.defaultEventMins],
  });
  await updateOne(id, (x) => ({ ...x, linked: { ...x.linked, eventId: ev.id } }));
  return ev;
}

/** Add a bill's due date as a task. */
export async function billToTask(id: string) {
  const m = await getMessage(id);
  if (!m?.dueDate) throw new Error("This bill has no due date to add.");
  const { state } = dueState(m.dueDate);
  const t = useStore.getState().upsert("tasks", {
    title: billTitle(m),
    due: m.dueDate,
    done: false,
    priority: state === "overdue" || state === "today" || state === "soon" ? "high" : "med",
    notes: `From ${m.from.name || m.from.address}: ${m.subject}`,
  });
  await updateOne(id, (x) => ({ ...x, linked: { ...x.linked, taskId: t.id } }));
  return t;
}

/** Remind about unpaid bills that are due soon (or overdue), once per bill. */
export async function maybeBillReminders(alert: Notifier = mailNotify, today = new Date()): Promise<number> {
  const m = mailSettings();
  if (!m.bills.remindDays || !m.alerts.desktop) return 0;
  const due = unpaidBills(useMail.getState().messages).filter(
    (b) => !b.muted && b.dueDate && b.reminded !== b.dueDate && dueState(b.dueDate, today).days <= m.bills.remindDays,
  );
  if (!due.length) return 0;
  const line = (b: MailMessage) =>
    `${b.from.name || b.from.address}${b.amount ? ` ${money(b.amount)}` : ""}: ${dueLabel(b.dueDate, today).toLowerCase()}`;
  if (due.length <= 3) for (const b of due) await alert("Bill reminder", line(b));
  else await alert(`${due.length} bills need paying`, due.slice(0, 3).map(line).join("\n"));
  await putMessages(
    due.map((b) => ({ ...b, reminded: b.dueDate })),
    keepText(),
  );
  await refreshMail();
  return due.length;
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
        fresh += (await syncAccountWithProvider(providerFor(a), a)).length;
      } catch (e) {
        failed++;
        const m = (e as Error).message;
        const lost =
          /invalid_grant|Graph 401|Google 401|AADSTS|AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed|authentication failed/i.test(m);
        useMail.setState({
          error: lost
            ? `${a.address}: your sign-in has expired. Open Settings → Email and press Reconnect.`
            : `${a.address}: ${m.slice(0, 120)}`,
        });
      }
    }
    await refreshMail();
    await maybeDailyDigest().catch(() => {});
    await maybeBillReminders().catch(() => {});
    useMail.setState({ syncing: false });
    return failed ? `${failed} account(s) couldn't sync.` : `Email synced${fresh ? `: ${fresh} new important` : ""}.`;
  })().finally(() => (inflight = null));
  return inflight;
}

/** Start background sync: when the app opens, when its window returns, and every `pollMins`. Returns the cleanup. */
export function startMailPolling(): () => void {
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
  const tick = setInterval(() => {
    sendDue().catch(() => {});
    wakeAndRemind().catch(() => {});
  }, 5_000);
  const onFocus = () => run(true);
  const onVisible = () => document.visibilityState === "visible" && run(true);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    clearInterval(tick);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
