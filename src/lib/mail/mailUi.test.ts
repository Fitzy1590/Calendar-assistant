import { describe, expect, it } from "vitest";
import { groupRows, initials, searchMail, tone } from "./mailUi";
import type { MailMessage } from "./types";

const m = (p: Partial<MailMessage>) => ({ from: { address: "a@b.com" }, subject: "", preview: "", receivedAt: 0, ...p }) as MailMessage;

describe("email list helpers", () => {
  it("makes initials from a name, a single word, or an address", () => {
    expect(initials("Sam Rivera", "s@x.com")).toBe("SR");
    expect(initials("Mary Jane Watson", "m@x.com")).toBe("MW");
    expect(initials("Energy Co", "x")).toBe("EC");
    expect(initials("", "bills@energyco.com")).toBe("BI");
    expect(initials(undefined, "")).toBe("?");
  });
  it("gives a sender the same tint every time, among four", () => {
    expect(tone("sam@x.com")).toBe(tone("SAM@x.com"));
    expect(new Set(["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"].map(tone)).size).toBeGreaterThan(1);
    expect([0, 1, 2, 3]).toContain(tone("anyone@x.com"));
  });
  it("searches sender, subject and text, needing every word", () => {
    const rows = [
      m({ from: { name: "Sam Rivera", address: "sam@riveraplumbing.com" }, subject: "Booking" }),
      m({ subject: "Energy bill", text: "Amount due $184" }),
    ];
    expect(searchMail(rows, "sam booking")).toHaveLength(1);
    expect(searchMail(rows, "amount due")).toHaveLength(1);
    expect(searchMail(rows, "sam bill")).toHaveLength(0);
    expect(searchMail(rows, "  ")).toHaveLength(2);
  });
  it("groups newest first by day", () => {
    const now = new Date(2026, 10, 11, 15).getTime();
    const g = groupRows(
      [
        m({ receivedAt: new Date(2026, 9, 1).getTime() }),
        m({ receivedAt: new Date(2026, 10, 11, 9).getTime() }),
        m({ receivedAt: new Date(2026, 10, 10, 9).getTime() }),
      ],
      now,
    );
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday", "Earlier"]);
  });
});
