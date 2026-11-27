import { differenceInCalendarMonths, getDate, getDaysInMonth } from "date-fns";
import { fromYmd } from "../util";
import type { Cents, Goal } from "./types";

/** Envelope budgets. Pure. */

/** 50% needs, 30% wants, 20% savings. Needs and wants round to the cent, savings takes the rest, so the parts always sum to income. */
export function split503020(incomeCents: Cents): { needs: Cents; wants: Cents; savings: Cents } {
  const needs = Math.round(incomeCents * 0.5);
  const wants = Math.round(incomeCents * 0.3);
  return { needs, wants, savings: incomeCents - needs - wants };
}

export interface Envelope {
  id: string;
  name: string;
  cents: Cents;
}

/** Zero-based: every cent of income gets a job. `leftCents` > 0 is unassigned, < 0 means over-allocated. */
export function zeroBased(incomeCents: Cents, envelopes: Envelope[]): { assignedCents: Cents; leftCents: Cents; balanced: boolean } {
  const assigned = envelopes.reduce((n, e) => n + e.cents, 0);
  return { assignedCents: assigned, leftCents: incomeCents - assigned, balanced: assigned === incomeCents };
}

/** What carries into next month: this month's budget plus last month's carry, less spending. Overspending carries as a negative. */
export function rollover(budgetCents: Cents, carriedInCents: Cents, spentCents: Cents): Cents {
  return budgetCents + carriedInCents - spentCents;
}

export interface Pace {
  status: "under" | "over";
  ratio: number; // spent / expected so far; 1 means exactly on pace
  expectedCents: Cents;
  elapsed: number; // share of the month gone, 0..1
}

/** Spending pace: spent against an even spread of the budget over the month. Exactly on pace counts as under. */
export function pace(spentCents: Cents, budgetCents: Cents, today: Date): Pace {
  const elapsed = getDate(today) / getDaysInMonth(today);
  const expected = Math.round(budgetCents * elapsed);
  const ratio = expected > 0 ? spentCents / expected : spentCents > 0 ? Infinity : 0;
  return { status: spentCents > expected ? "over" : "under", ratio, expectedCents: expected, elapsed };
}

/** What is left to save and, with a target date, what to put aside each month (rounded up so the date is met). */
export function goalPlan(g: Goal, today: Date): { remainingCents: Cents; perMonthCents: Cents | null; done: boolean; late: boolean } {
  const remaining = Math.max(0, g.targetCents - g.savedCents);
  if (remaining === 0) return { remainingCents: 0, perMonthCents: 0, done: true, late: false };
  if (!g.targetDate) return { remainingCents: remaining, perMonthCents: null, done: false, late: false };
  const months = differenceInCalendarMonths(fromYmd(g.targetDate), today);
  if (months <= 0) return { remainingCents: remaining, perMonthCents: remaining, done: false, late: fromYmd(g.targetDate) < today };
  return { remainingCents: remaining, perMonthCents: Math.ceil(remaining / months), done: false, late: false };
}
