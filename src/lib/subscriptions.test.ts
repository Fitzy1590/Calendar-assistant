import { describe, expect, it } from "vitest";
import type { Txn } from "./bankStatement";
import {
  billedVia,
  byCategory,
  cadenceFor,
  cancelGuide,
  chargedAfterCancel,
  detectSubscriptions,
  merchantKey,
  mergeDetected,
  totals,
} from "./subscriptions";

const t = (date: string, amount: number, description: string): Txn => ({ date, amount, description });

describe("subscriptions", () => {
  it("gives the same key to the same merchant with different reference numbers", () => {
    expect(merchantKey("NETFLIX.COM 123456 SYDNEY AU")).toBe(merchantKey("NETFLIX.COM 987654 SYDNEY AU"));
    expect(merchantKey("PAYPAL *CHESSCOM 4029357733")).toContain("chesscom");
    expect(merchantKey("VISA PURCHASE 10/11 GYM TOWN PTY LTD")).toContain("gym town");
  });
  it("works out how often", () => {
    expect([7, 14, 30, 31, 91, 365, 50].map(cadenceFor)).toEqual([
      "weekly",
      "fortnightly",
      "monthly",
      "monthly",
      "quarterly",
      "yearly",
      null,
    ]);
  });
  it("finds a monthly subscription and works out the cost per month and year", () => {
    const s = detectSubscriptions([
      t("2026-08-10", -16.99, "NETFLIX.COM 111"),
      t("2026-09-10", -16.99, "NETFLIX.COM 222"),
      t("2026-10-10", -16.99, "NETFLIX.COM 333"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      name: "Netflix",
      category: "Streaming",
      cadence: "monthly",
      amount: 16.99,
      count: 3,
      known: true,
      nextDate: "2026-11-09",
    });
    expect(s[0].yearly).toBeCloseTo(203.88, 2);
    expect(s[0].monthly).toBeCloseTo(16.99, 2);
  });
  it("finds an unknown merchant only when it repeats at a steady rhythm and amount", () => {
    const gym = [
      t("2026-08-01", -29.95, "FIT CLUB PTY LTD"),
      t("2026-09-01", -29.95, "FIT CLUB PTY LTD"),
      t("2026-10-01", -29.95, "FIT CLUB PTY LTD"),
    ];
    expect(detectSubscriptions(gym)[0]).toMatchObject({ name: "Fit Club", category: "Other", known: false });
    const shopping = [
      t("2026-08-03", -54.2, "WOOLWORTHS 1234"),
      t("2026-08-17", -131.5, "WOOLWORTHS 1234"),
      t("2026-09-09", -12.1, "WOOLWORTHS 1234"),
    ];
    expect(detectSubscriptions(shopping)).toEqual([]); // irregular
    expect(detectSubscriptions([t("2026-10-01", -29.95, "FIT CLUB")])).toEqual([]); // one charge of an unknown merchant
  });
  it("assumes monthly for a single charge from a recognised service, ignores money in, and spots price rises", () => {
    expect(detectSubscriptions([t("2026-10-05", -12.99, "SPOTIFY P1A2B3")])[0]).toMatchObject({ name: "Spotify", cadence: "monthly" });
    expect(detectSubscriptions([t("2026-10-05", 12.99, "SPOTIFY REFUND")])).toEqual([]);
    const up = detectSubscriptions([t("2026-09-10", -16.99, "NETFLIX"), t("2026-10-10", -18.99, "NETFLIX")]);
    expect(up[0].priceChange).toEqual({ from: 16.99, to: 18.99 });
  });
  it("treats one big charge from a recognised service as a yearly plan", () => {
    expect(detectSubscriptions([t("2026-09-20", -139, "MICROSOFT 365 PERSONAL")])[0]).toMatchObject({
      cadence: "yearly",
      nextDate: "2027-09-20",
    });
    expect(detectSubscriptions([t("2026-09-20", -85, "TELSTRA POSTPAID")])[0].cadence).toBe("monthly");
  });
  it("sees which billing service a charge goes through", () => {
    expect(billedVia("APPLE.COM/BILL SYDNEY")).toBe("Apple");
    expect(billedVia("GOOGLE *YouTube Premium")).toBe("Google Play");
    expect(billedVia("PAYPAL *SPOTIFY")).toBe("PayPal");
    expect(billedVia("NETFLIX.COM")).toBeUndefined();
  });
  it("totals and groups by category, leaving out ones you hid", () => {
    const subs = detectSubscriptions([
      t("2026-09-10", -16.99, "NETFLIX"),
      t("2026-10-10", -16.99, "NETFLIX"),
      t("2026-09-12", -12.99, "SPOTIFY"),
      t("2026-10-12", -12.99, "SPOTIFY"),
    ]);
    expect(totals(subs)).toMatchObject({ count: 2, monthly: 29.98 });
    expect(byCategory(subs).map((g) => g.category)).toEqual(["Streaming", "Music & audio"]);
    const hidden = subs.map((s) => (s.id === "spotify" ? { ...s, hidden: true } : s));
    expect(totals(hidden).count).toBe(1);
  });
  it("keeps your choices when a new statement is imported", () => {
    const first = detectSubscriptions([t("2026-09-10", -16.99, "NETFLIX"), t("2026-10-10", -16.99, "NETFLIX")]);
    const saved = first.map((s) => ({ ...s, hidden: true }));
    const next = detectSubscriptions([t("2026-10-10", -16.99, "NETFLIX"), t("2026-11-10", -16.99, "NETFLIX")]);
    expect(mergeDetected(saved, next)[0].hidden).toBe(true);
    expect(mergeDetected(saved, [])).toHaveLength(1); // old ones stay until you remove them
  });
  it("warns when a cancelled subscription is charged again", () => {
    const subs = detectSubscriptions([t("2026-09-10", -16.99, "NETFLIX"), t("2026-11-10", -16.99, "NETFLIX")]);
    expect(chargedAfterCancel(subs, { netflix: "2026-10-01" })).toHaveLength(1);
    expect(chargedAfterCancel(subs, { netflix: "2026-11-20" })).toHaveLength(0);
    expect(chargedAfterCancel(subs, {})).toHaveLength(0);
  });
  it("gives cancel steps with the provider's page, the billing service first, or a search", () => {
    const direct = cancelGuide({ name: "Netflix", known: true });
    expect(direct.links[0].url).toBe("https://www.netflix.com/cancelplan");
    expect(direct.links.some((l) => l.url.includes("google.com/search"))).toBe(true);
    const apple = cancelGuide({ name: "Spotify", known: true, via: "Apple" });
    expect(apple.links[0].url).toContain("apps.apple.com");
    expect(apple.steps[0]).toMatch(/Apple/);
    const unknown = cancelGuide({ name: "Fit Club", known: false });
    expect(unknown.links).toHaveLength(1);
    expect(unknown.steps[0]).toMatch(/Account, Billing/);
  });
});
