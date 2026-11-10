import { addDays, addHours, nextMonday, nextSaturday, set } from "date-fns";
import type { FollowUp, MailMessage } from "./types";

/** Snoozing mail and following up on mail you sent. Pure, so it is tested. */

export interface SnoozeOption {
  label: string;
  at: number;
}

const at = (d: Date, h: number) => set(d, { hours: h, minutes: 0, seconds: 0, milliseconds: 0 });

/** The usual choices, from `now`. "Later today" only appears before 3 pm. */
export function snoozeOptions(now = new Date()): SnoozeOption[] {
  const out: SnoozeOption[] = [];
  if (now.getHours() < 15) out.push({ label: "Later today · 5:00 pm", at: at(now, 17).getTime() });
  out.push({ label: "Tomorrow · 8:00 am", at: at(addDays(now, 1), 8).getTime() });
  const sat = at(nextSaturday(now), 9);
  out.push({ label: "This weekend · Sat 9:00 am", at: sat.getTime() });
  out.push({ label: "Next week · Mon 8:00 am", at: at(nextMonday(now), 8).getTime() });
  return out;
}

export const isSnoozed = (m: Pick<MailMessage, "snoozedUntil">, now = Date.now()) => !!m.snoozedUntil && m.snoozedUntil > now;

/** Snoozed mail whose time has come: it should reappear as unread and raise an alert. */
export const dueSnoozes = (msgs: MailMessage[], now = Date.now()) => msgs.filter((m) => m.snoozedUntil && m.snoozedUntil <= now);

export function newFollowUp(
  p: { accountId: string; threadId?: string; to: string[]; subject: string },
  days: number,
  now = Date.now(),
): FollowUp {
  return {
    id: crypto.randomUUID().slice(0, 8),
    ...p,
    to: p.to.map((a) => a.toLowerCase()),
    sentAt: now,
    due: addHours(now, days * 24).getTime(),
  };
}

/** Follow-ups that got an answer (someone you wrote to, or the same thread, replied after you sent) and ones now overdue. */
export function checkFollowUps(list: FollowUp[], msgs: MailMessage[], now = Date.now()): { answered: FollowUp[]; overdue: FollowUp[] } {
  const answered: FollowUp[] = [];
  const overdue: FollowUp[] = [];
  for (const f of list) {
    const reply = msgs.some(
      (m) =>
        m.accountId === f.accountId &&
        m.receivedAt > f.sentAt &&
        ((f.threadId && m.threadId === f.threadId) || f.to.includes(m.from.address.toLowerCase())),
    );
    if (reply) answered.push(f);
    else if (f.due <= now) overdue.push(f);
  }
  return { answered, overdue };
}
