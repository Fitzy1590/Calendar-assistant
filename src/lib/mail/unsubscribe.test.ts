import { describe, expect, it } from "vitest";
import { parseUnsubscribe, unsubscribeDraft, unsubscribeFor } from "./unsubscribe";

describe("unsubscribe links", () => {
  it("reads a web link and a mailto from the header", () => {
    const o = parseUnsubscribe("<mailto:unsub@news.com?subject=Unsubscribe%20me>, <https://news.com/u/abc123>");
    expect(o?.web).toBe("https://news.com/u/abc123");
    expect(o?.mailto).toEqual({ to: "unsub@news.com", subject: "Unsubscribe me", body: "Please unsubscribe me from this mailing list." });
  });
  it("accepts only https for the web link, and ignores nonsense", () => {
    expect(parseUnsubscribe("<http://news.com/u>")).toBeNull();
    expect(parseUnsubscribe("<javascript:alert(1)>")).toBeNull();
    expect(parseUnsubscribe("<mailto:not an address>")).toBeNull();
    expect(parseUnsubscribe("")).toBeNull();
    expect(parseUnsubscribe(undefined)).toBeNull();
  });
  it("finds it on a message, and builds a draft that isn't sent by itself", () => {
    const m = { headers: { "list-unsubscribe": "<mailto:stop@x.com>" } };
    const o = unsubscribeFor(m)!;
    const d = unsubscribeDraft(o, "acc")!;
    expect(d.to[0].address).toBe("stop@x.com");
    expect(d.subject).toBe("Unsubscribe");
    expect(unsubscribeDraft({ web: "https://x.com" }, "acc")).toBeNull();
    expect(unsubscribeFor({ headers: {} })).toBeNull();
  });
});
