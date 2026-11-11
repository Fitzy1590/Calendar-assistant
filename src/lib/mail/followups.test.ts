import { describe, expect, it } from "vitest";
import { checkFollowUps, dueSnoozes, isSnoozed, newFollowUp, snoozeOptions } from "./followups";
import type { MailMessage } from "./types";

const msg = (p: Partial<MailMessage>) =>
  ({ accountId: "a", threadId: "t1", from: { address: "sam@x.com" }, receivedAt: 0, ...p }) as MailMessage;

describe("snooze", () => {
  it("offers later today only before 3 pm, and always tomorrow, the weekend and next week", () => {
    const morning = snoozeOptions(new Date(2026, 10, 10, 9, 0)); // Tue
    expect(morning.map((o) => o.label.split(" · ")[0])).toEqual(["Later today", "Tomorrow", "This weekend", "Next week"]);
    expect(new Date(morning[2].at).getDay()).toBe(6);
    expect(new Date(morning[3].at).getDay()).toBe(1);
    const evening = snoozeOptions(new Date(2026, 10, 10, 18, 0));
    expect(evening[0].label.startsWith("Tomorrow")).toBe(true);
    expect(morning.every((o) => o.at > new Date(2026, 10, 10, 9, 0).getTime())).toBe(true);
  });
  it("knows what is snoozed and what has woken", () => {
    expect(isSnoozed({ snoozedUntil: 200 }, 100)).toBe(true);
    expect(isSnoozed({ snoozedUntil: 200 }, 300)).toBe(false);
    expect(isSnoozed({}, 100)).toBe(false);
    expect(dueSnoozes([msg({ snoozedUntil: 50 }), msg({ snoozedUntil: 500 }), msg({})], 100)).toHaveLength(1);
  });
});

describe("follow-ups", () => {
  const f = newFollowUp({ accountId: "a", threadId: "t1", to: ["Sam@X.com"], subject: "Quote" }, 3, 1000);
  it("is due after the number of days", () => {
    expect(f.due).toBe(1000 + 3 * 86400e3);
    expect(f.to).toEqual(["sam@x.com"]);
  });
  it("is answered when someone you wrote to, or the same thread, replies after you sent", () => {
    expect(checkFollowUps([f], [msg({ receivedAt: 2000 })], 5000).answered).toHaveLength(1);
    expect(checkFollowUps([f], [msg({ receivedAt: 2000, from: { address: "other@z.com" }, threadId: "t1" })], 5000).answered).toHaveLength(
      1,
    );
    expect(checkFollowUps([f], [msg({ receivedAt: 500 })], 5000).answered).toHaveLength(0); // before you sent
  });
  it("is overdue only when unanswered and past its date", () => {
    expect(checkFollowUps([f], [], 2000).overdue).toHaveLength(0);
    expect(checkFollowUps([f], [], f.due + 1).overdue).toHaveLength(1);
    expect(checkFollowUps([f], [msg({ receivedAt: 2000 })], f.due + 1).overdue).toHaveLength(0);
  });
});
