import { describe, expect, it } from "vitest";
import { dueLabel, dueState, looksLikeBill, money, parseAmount, parseDueDate } from "./bills";

const recv = new Date(2026, 10, 10, 9, 0); // Tue 10 Nov 2026

describe("bill amount", () => {
  it("finds the amount next to a cue word, not just the first number", () => {
    expect(parseAmount("Plan fee $9.99. Total amount due: $184.20 by Friday")).toBe(184.2);
  });
  it("reads thousands separators, whole dollars and trailing currency codes", () => {
    expect(parseAmount("Please pay $1,250.50")).toBe(1250.5);
    expect(parseAmount("You owe $75")).toBe(75);
    expect(parseAmount("Balance 310.00 AUD")).toBe(310);
  });
  it("returns nothing when there is no amount", () => {
    expect(parseAmount("Your bill is ready to view online")).toBeUndefined();
  });
});

describe("bill due date", () => {
  it("reads common forms near the word due", () => {
    expect(parseDueDate("Amount due $50, due 12 November 2026", recv)).toBe("2026-11-12");
    expect(parseDueDate("Due date: Nov 20, 2026", recv)).toBe("2026-11-20");
    expect(parseDueDate("payment due 25/11/2026", recv)).toBe("2026-11-25");
    expect(parseDueDate("Due 2026-12-01", recv)).toBe("2026-12-01");
    expect(parseDueDate("Due on 3rd Dec", recv)).toBe("2026-12-03");
  });
  it("reads words relative to the day it arrived", () => {
    expect(parseDueDate("Payment due tomorrow", recv)).toBe("2026-11-11");
    expect(parseDueDate("Please pay by Friday", recv)).toBe("2026-11-13");
    expect(parseDueDate("due today", recv)).toBe("2026-11-10");
  });
  it("rolls a date with no year into next year when it would be long past", () => {
    expect(parseDueDate("due 5 January", recv)).toBe("2027-01-05");
  });
  it("returns nothing without a due cue", () => {
    expect(parseDueDate("Your statement for 12 November is ready", recv)).toBeUndefined();
  });
});

describe("due state and labels", () => {
  it("labels overdue, today, tomorrow and later", () => {
    expect(dueState("2026-11-08", recv).state).toBe("overdue");
    expect(dueLabel("2026-11-08", recv)).toBe("Overdue by 2 days");
    expect(dueLabel("2026-11-10", recv)).toBe("Due today");
    expect(dueLabel("2026-11-11", recv)).toBe("Due tomorrow");
    expect(dueLabel("2026-11-20", recv)).toBe("Due in 10 days");
    expect(dueLabel(undefined, recv)).toBe("No due date found");
  });
});

describe("is it a bill", () => {
  it("accepts bills and invoices, rejects receipts and paid confirmations", () => {
    expect(looksLikeBill("Your bill is ready", "")).toBe(true);
    expect(looksLikeBill("Invoice 1042", "Amount due $200")).toBe(true);
    expect(looksLikeBill("Receipt for your order", "Total $62")).toBe(false);
    expect(looksLikeBill("Thank you for your payment", "Your invoice has been paid in full")).toBe(false);
  });
  it("formats money", () => {
    expect(money(184.2)).toBe("$184.20");
    expect(money(75)).toBe("$75");
  });
});
