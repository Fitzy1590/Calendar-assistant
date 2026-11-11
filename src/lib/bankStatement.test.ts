import { describe, expect, it } from "vitest";
import { parseAmount, parseCsv, parseDate, parseOfx, parseQif, parseStatement, splitCsvLine } from "./bankStatement";

describe("bank statement parsing", () => {
  it("reads dates the way banks write them, day first", () => {
    expect(parseDate("10/11/2026")).toBe("2026-11-10");
    expect(parseDate("3/1/26")).toBe("2026-01-03");
    expect(parseDate("11/25/2026")).toBe("2026-11-25"); // can only be month first
    expect(parseDate("2026-11-10")).toBe("2026-11-10");
    expect(parseDate("10 Nov 2026")).toBe("2026-11-10");
    expect(parseDate("10-November-26")).toBe("2026-11-10");
    expect(parseDate("20261110120000")).toBe("2026-11-10");
    expect(parseDate("Netflix")).toBeNull();
    expect(parseDate("45/45/2026")).toBeNull();
  });
  it("reads amounts with signs, brackets, commas and DR", () => {
    expect(parseAmount("-$1,234.50")).toBe(-1234.5);
    expect(parseAmount("(12.99)")).toBe(-12.99);
    expect(parseAmount("12.99 DR")).toBe(-12.99);
    expect(parseAmount("+45.00")).toBe(45);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
  it("splits quoted CSV fields", () => {
    expect(splitCsvLine('10/11/2026,"-16.99","NETFLIX.COM, SYDNEY","say ""hi"""')).toEqual([
      "10/11/2026",
      "-16.99",
      "NETFLIX.COM, SYDNEY",
      'say "hi"',
    ]);
  });
  it("reads a headerless CSV (CommBank style: date, amount, description, balance)", () => {
    const t = parseCsv('10/11/2026,"-16.99","NETFLIX.COM SYDNEY AU","+1,204.11"\n09/11/2026,"+2500.00","SALARY ACME","+1,221.10"');
    expect(t).toEqual([
      { date: "2026-11-10", amount: -16.99, description: "NETFLIX.COM SYDNEY AU" },
      { date: "2026-11-09", amount: 2500, description: "SALARY ACME" },
    ]);
  });
  it("reads a CSV with headers and separate debit and credit columns", () => {
    const t = parseCsv(
      "Date,Narrative,Debit Amount,Credit Amount,Balance\n10 Nov 2026,SPOTIFY P123,12.99,,500.00\n9 Nov 2026,TRANSFER IN,,100.00,512.99",
    );
    expect(t[0]).toEqual({ date: "2026-11-10", amount: -12.99, description: "SPOTIFY P123" });
    expect(t[1].amount).toBe(100);
  });
  it("reads a headed CSV with one amount column, and semicolons", () => {
    const t = parseCsv("Transaction Date;Amount;Description\n2026-11-10;-9.99;DISNEY PLUS");
    expect(t).toEqual([{ date: "2026-11-10", amount: -9.99, description: "DISNEY PLUS" }]);
  });
  it("returns nothing for text that isn't a statement", () => {
    expect(parseCsv("hello\nworld")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
  it("reads OFX and QIF, and picks the format from the contents", () => {
    const ofx =
      "<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261110<TRNAMT>-16.99<NAME>NETFLIX.COM<MEMO>SYDNEY</STMTTRN><STMTTRN><DTPOSTED>20261109<TRNAMT>50.00<NAME>REFUND</STMTTRN></OFX>";
    expect(parseOfx(ofx)[0]).toEqual({ date: "2026-11-10", amount: -16.99, description: "NETFLIX.COM SYDNEY" });
    expect(parseStatement(ofx, "x.csv")).toHaveLength(2);
    const qif = "!Type:Bank\nD10/11/2026\nT-12.99\nPSPOTIFY\n^\nD09/11/2026\nT100.00\nPPAY\n^\n";
    expect(parseQif(qif)).toEqual([
      { date: "2026-11-10", amount: -12.99, description: "SPOTIFY" },
      { date: "2026-11-09", amount: 100, description: "PAY" },
    ]);
    expect(parseStatement(qif, "s.qif")).toHaveLength(2);
  });
});
