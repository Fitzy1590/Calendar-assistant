import { describe, expect, it } from "vitest";
import { fmtCents, parseCents } from "./money";

describe("parseCents", () => {
  it("reads plain amounts exactly", () => {
    expect(parseCents("1420")).toBe(142000);
    expect(parseCents("$1,420.5")).toBe(142050);
    expect(parseCents("19.99")).toBe(1999);
    expect(parseCents("0.07")).toBe(7);
    expect(parseCents(".5")).toBe(50);
    expect(parseCents("-138.99")).toBe(-13899);
    expect(parseCents(" 12 ")).toBe(1200);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "abc", "1.234", "1,23", "12e3", "--1", "$", "."]) expect(parseCents(bad)).toBeNull();
  });
});

describe("fmtCents", () => {
  it("formats", () => {
    expect(fmtCents(142000)).toBe("$1,420.00");
    expect(fmtCents(-13899)).toBe("-$138.99");
    expect(fmtCents(5)).toBe("$0.05");
    expect(fmtCents(0)).toBe("$0.00");
  });
});
