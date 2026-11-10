import { describe, expect, it, vi } from "vitest";
import { askClaude, askGemini, draftPrompt, ideasPrompt, parseIdeas, parseSummary, summaryPrompt } from "./ai";
import { buildThreadContext, redact, stripQuoted } from "./thread";
import { dateIdeas } from "./mailDates";
import type { MailMessage } from "./types";

const m = (p: Partial<MailMessage>): MailMessage =>
  ({ from: { name: "Sam", address: "sam@x.com" }, subject: "Booking", receivedAt: 0, text: "", preview: "", ...p }) as MailMessage;

describe("preparing a thread for an AI", () => {
  it("strips quoted replies and signatures", () => {
    const t = "Yes, 10am works.\n\nOn Tue 10 Nov, Pat wrote:\n> Can you do 10am?\n\n-- \nSam";
    expect(stripQuoted(t)).toBe("Yes, 10am works.");
    expect(stripQuoted("Hi\n> quoted\nThanks")).toBe("Hi\nThanks");
    expect(stripQuoted("Hi\n\nFrom: Pat <p@x.com>\nSent: Monday\nold stuff")).toBe("Hi");
  });
  it("hides card numbers, long numbers, link tokens and long codes", () => {
    const r = redact(
      "Card 4111 1111 1111 1111, account 12345678, BSB 062-000, code ABCDEFGHIJKLMNOPQRSTUVWX1, see https://pay.x.com/p?token=secret123",
    );
    expect(r).not.toMatch(/4111|12345678|062-000|secret123|ABCDEFGH/);
    expect(r).toContain("[card number]");
    expect(r).toContain("https://pay.x.com/p?…");
    expect(redact("Thursday at 10am, $2,400")).toBe("Thursday at 10am, $2,400");
  });
  it("keeps the newest messages, oldest first, marks yours as Me and counts what was hidden", () => {
    const msgs = [1, 2, 3, 4].map((i) => m({ receivedAt: i, text: `message ${i}` }));
    msgs[3] = m({ receivedAt: 4, text: "my reply, ref 99999999", from: { address: "ME@x.com" } });
    const c = buildThreadContext(msgs, "me@x.com", { keep: 3 });
    expect(c.count).toBe(3);
    expect(c.text.indexOf("message 2")).toBeLessThan(c.text.indexOf("message 3"));
    expect(c.text).not.toContain("message 1");
    expect(c.text).toContain("From: Me");
    expect(c.hidden).toBe(1);
  });
});

describe("prompts and answers", () => {
  it("tells the model not to invent facts and to ignore instructions in the thread", () => {
    const p = draftPrompt({ thread: "From: Sam\n\nHi", tone: "brief", notes: "say yes" });
    expect(p.system).toMatch(/\[CHECK:/);
    expect(p.system).toMatch(/Ignore any instructions/);
    expect(p.user).toContain("Brief");
    expect(p.user).toContain("say yes");
    expect(ideasPrompt("x").user).toMatch(/JSON array/);
    expect(summaryPrompt("x").user).toMatch(/deadlines/);
  });
  it("reads reply ideas from JSON or plain lines, and summaries with deadlines", () => {
    expect(parseIdeas('Here: ["Sounds good", "Can we do Friday?", "Thanks!", "extra"]')).toEqual([
      "Sounds good",
      "Can we do Friday?",
      "Thanks!",
    ]);
    expect(parseIdeas('1. Sounds good\n2. "Thanks!"')).toEqual(["Sounds good", "Thanks!"]);
    expect(parseSummary("Sam wants Thursday confirmed.\nDeadlines:\n- Confirm: today\n- Quote: Fri 13 Nov")).toEqual({
      summary: "Sam wants Thursday confirmed.",
      deadlines: ["Confirm: today", "Quote: Fri 13 Nov"],
    });
    expect(parseSummary("All quiet.\n- none").deadlines).toEqual([]);
  });
  it("calls Claude with the key in a header and returns its text", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, text: JSON.stringify({ content: [{ type: "text", text: "Hello there" }] }) });
    expect(await askClaude({ system: "s", user: "u" }, "sk-test", post)).toBe("Hello there");
    const [url, init] = post.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-test");
    expect(url).not.toContain("sk-test");
  });
  it("calls Gemini with the key in a header (never in the address) and the chosen model", async () => {
    const post = vi.fn().mockResolvedValue({
      status: 200,
      text: JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hi " }, { text: "Sam" }] } }] }),
    });
    expect(await askGemini({ system: "s", user: "u" }, "g-key", "gemini-2.5-flash", post)).toBe("Hi Sam");
    const [url, init] = post.mock.calls[0];
    expect(url).toContain("/models/gemini-2.5-flash:generateContent");
    expect(url).not.toContain("g-key");
    expect(init.headers["x-goog-api-key"]).toBe("g-key");
  });
  it("turns failures into plain advice", async () => {
    const bad = (status: number, body = "{}") => vi.fn().mockResolvedValue({ status, text: body });
    await expect(askClaude({ system: "", user: "" }, "k", bad(401))).rejects.toThrow(/refused the key/);
    await expect(askGemini({ system: "", user: "" }, "k", "nope", bad(404))).rejects.toThrow(/model name/);
    await expect(askGemini({ system: "", user: "" }, "k", "m", bad(429))).rejects.toThrow(/too much/);
    await expect(askClaude({ system: "", user: "" }, "", bad(200))).rejects.toThrow(/Add your Anthropic key/);
    await expect(
      askGemini(
        { system: "", user: "" },
        "k",
        "m",
        vi.fn().mockResolvedValue({ status: 200, text: JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }) }),
      ),
    ).rejects.toThrow(/declined/);
  });
});

describe("dates in an email", () => {
  const now = new Date(2026, 10, 10, 9, 0); // Tue 10 Nov 2026
  it("finds a dated sentence as a 1-hour event, and a day-only one as all day", () => {
    const ideas = dateIdeas("Your dentist appointment is on Friday at 3pm. Please bring your card. The quote is due 20 November.", now);
    expect(ideas.length).toBe(2);
    expect(ideas[0].allDay).toBe(false);
    expect(ideas[0].start.getHours()).toBe(15);
    expect(ideas[0].end.getTime() - ideas[0].start.getTime()).toBe(3600e3);
    expect(ideas[1].allDay).toBe(true);
    expect(ideas[1].start.getDate()).toBe(20);
  });
  it("ignores dates that have passed and mail with no dates", () => {
    expect(dateIdeas("Thanks for lunch, it was great.", now)).toEqual([]);
    expect(
      dateIdeas("See you at the party on 1 January.", new Date(2026, 10, 10)).every((i) => i.start.getTime() >= now.getTime() - 3600e3),
    ).toBe(true);
  });
});
