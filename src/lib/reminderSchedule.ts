/** One notification to hand to Android's alarm manager. */
export interface Planned {
  id: number;
  title: string;
  body: string;
  at: Date;
}
export interface ReminderLike {
  key: string;
  title: string;
  detail: string;
  at: Date;
}

/** Stable positive 31-bit id so the same reminder always maps to the same notification (Android ids are ints). */
export function notificationId(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return h & 0x7fffffff || 1;
}

/**
 * Reminders worth scheduling now: still in the future, within `horizonMs`, soonest first, capped (Android limits
 * pending alarms). Past reminders are not scheduled, so nothing fires late after the phone was off.
 */
export function planNotifications(items: ReminderLike[], now: Date, horizonMs = 7 * 864e5, max = 50): Planned[] {
  const from = now.getTime() + 5000;
  const seen = new Set<number>();
  return items
    .filter((r) => r.at.getTime() > from && r.at.getTime() <= now.getTime() + horizonMs)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((r) => ({ id: notificationId(r.key), title: r.title, body: r.detail, at: r.at }))
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .slice(0, max);
}
