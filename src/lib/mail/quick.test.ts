import { describe, expect, it } from "vitest";
import { importanceSource, SOURCE_LABEL, stopImportant } from "./quick";

const m = (bucket: string, reasons: string[] = []) => ({ bucket, reasons }) as never;

describe("quick not-important choices", () => {
  it("names the switch behind an important email", () => {
    expect(importanceSource(m("urgent"))).toBe("actionUrgent");
    expect(importanceSource(m("action"))).toBe("actionUrgent");
    expect(importanceSource(m("financial"))).toBe("financial");
    expect(importanceSource(m("inbox", ["From someone in your Contacts"]))).toBe("contacts");
    expect(importanceSource(m("inbox"))).toBeNull();
  });
  it("turns just that switch off", () => {
    const base = { actionUrgent: true, contacts: true, financial: true, everything: false };
    expect(stopImportant(base, "financial")).toEqual({ ...base, financial: false });
    expect(base.financial).toBe(true);
    expect(SOURCE_LABEL.financial).toMatch(/bills/);
  });
});
