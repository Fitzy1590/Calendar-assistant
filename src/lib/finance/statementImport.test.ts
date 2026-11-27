import { describe, expect, it } from "vitest";
import { spentByEnvelope, toRows, unsortedMerchants } from "./statementImport";

const t = (date: string, amount: number, description: string) => ({ date, amount, description });

describe("toRows", () => {
  it("converts to cents and keeps ids stable across imports", () => {
    const a = toRows([t("2026-11-03", -22.99, "NETFLIX.COM 123"), t("2026-11-04", 2300, "SALARY")]);
    const b = toRows([t("2026-11-03", -22.99, "NETFLIX.COM 123"), t("2026-11-04", 2300, "SALARY")]);
    expect(a[0].cents).toBe(-2299);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });
  it("keeps identical lines in one file apart", () => {
    const r = toRows([t("2026-11-03", -4.5, "COFFEE"), t("2026-11-03", -4.5, "COFFEE")]);
    expect(new Set(r.map((x) => x.id)).size).toBe(2);
  });
  it("avoids float drift", () => expect(toRows([t("2026-11-03", -0.07, "X")])[0].cents).toBe(-7));
});

describe("spentByEnvelope", () => {
  it("adds this month's money out for assigned lines only", () => {
    const rows = [
      { id: "1", date: "2026-11-02", cents: -1000, desc: "a", envelopeId: "e1" },
      { id: "2", date: "2026-11-09", cents: -500, desc: "b", envelopeId: "e1" },
      { id: "3", date: "2026-10-30", cents: -9999, desc: "c", envelopeId: "e1" },
      { id: "4", date: "2026-11-09", cents: 700, desc: "refund", envelopeId: "e1" },
      { id: "5", date: "2026-11-09", cents: -300, desc: "d" },
    ];
    expect([...spentByEnvelope(rows, "2026-11")]).toEqual([["e1", 1500]]);
  });
});

describe("unsortedMerchants", () => {
  it("groups by merchant and skips income and sorted lines", () => {
    const rows = toRows([
      t("2026-11-01", -10, "WOOLWORTHS 1234 SYDNEY"),
      t("2026-11-05", -30, "WOOLWORTHS 5678 SYDNEY"),
      t("2026-11-02", -5, "CAFE X"),
      t("2026-11-03", 100, "REFUND"),
    ]);
    rows[2].envelopeId = "e";
    const m = unsortedMerchants(rows);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ totalCents: 4000, count: 2 });
  });
});
