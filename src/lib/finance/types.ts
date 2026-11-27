/** Shapes for the finance module. Money is whole cents (integers), never floats. Dates are local "yyyy-MM-dd". */

export type Cents = number;
export type Every = "once" | "weekly" | "fortnightly" | "monthly" | "yearly";

export interface FinAccount {
  id: string;
  name: string;
  openingCents: Cents; // balance at the start of `asOf`
  asOf: string;
}

/** A bill or a payday that repeats (or happens once). */
export interface Schedule {
  id: string;
  accountId: string;
  name: string;
  kind: "income" | "bill";
  cents: Cents; // always positive
  start: string;
  every: Every;
  until?: string;
}

/** One dated cash movement. `due` is the date on the bill or payslip, `effective` the day the balance moves. */
export interface CashItem {
  id: string;
  accountId: string;
  name: string;
  kind: "income" | "bill";
  cents: Cents;
  due: string;
  effective: string;
}

export type DayFlag = "low" | "overdraft";

export interface ProjectedDay {
  date: string;
  balanceCents: Cents; // end of day
  deltaCents: Cents;
  flags: DayFlag[];
  items: CashItem[];
}

/** A spending envelope for the current month. `spentCents` is entered by hand until statement import is added. */
export interface BudgetRow {
  id: string;
  name: string;
  bucket: "needs" | "wants" | "savings";
  cents: Cents; // monthly budget
  spentCents: Cents;
  carriedCents?: Cents; // unspent (or overspent) from last month
  month: string; // yyyy-MM the spending belongs to
}

export interface Goal {
  id: string;
  name: string;
  targetCents: Cents;
  savedCents: Cents;
  targetDate?: string; // yyyy-MM-dd
}

/** One imported statement line. `cents` is negative for money out. */
export interface TxnRow {
  id: string;
  date: string;
  cents: Cents;
  desc: string;
  envelopeId?: string;
}
