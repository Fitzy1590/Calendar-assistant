import { addDays, format } from "date-fns";
import { useMemo, useState } from "react";
import { Menu, Seg } from "../ui";
import { AccountForm, BudgetForm, ScheduleForm, SubForm } from "./FinanceForms";
import type { useFinanceData } from "./useFinanceData";
import { pace, rollover, split503020, zeroBased } from "../../lib/finance/budgetCalculator";
import { expand, monthlyEquivalent, project } from "../../lib/finance/cashflowEngine";
import { fmtCents, parseCents } from "../../lib/finance/money";
import { dueAlerts, fromDetected, hikePercent, isPriceHike, monthlyCents } from "../../lib/finance/subscriptionTracker";
import type { BudgetRow, FinAccount, ProjectedDay, Schedule } from "../../lib/finance/types";
import { fromYmd, todayYmd, uid, ymd } from "../../lib/util";
import { toast, useStore } from "../../store";
import { GoalsTile, TransactionsTile } from "./FinanceMore";

type Data = ReturnType<typeof useFinanceData>;
type Form =
  | null
  | { k: "account"; v?: FinAccount }
  | { k: "schedule"; v?: Schedule }
  | { k: "sub"; v?: Data["subs"][number] }
  | { k: "budget" };

const W = 700;
const H = 200;
const L = 52;
const B = 22;
const T = 8;

function Chart({ days, buffer }: { days: ProjectedDay[]; buffer: number }) {
  const bals = days.map((d) => d.balanceCents);
  const lo = Math.min(0, ...bals) - 5000;
  const hi = Math.max(buffer, ...bals) + 5000;
  const x = (i: number) => L + (i * (W - L - 8)) / Math.max(1, days.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const od = days.filter((d) => d.flags.includes("overdraft")).length;
  const low = days.filter((d) => d.flags.includes("low")).length;
  const ticks = [0, Math.floor(days.length / 3), Math.floor((2 * days.length) / 3), days.length - 1];
  return (
    <svg
      className="fin-chart"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Projected balance over ${days.length} days: ${od} overdraft days, ${low} low-balance days`}
    >
      <line className="fin-axis" x1={L} x2={W - 8} y1={y(0)} y2={y(0)} />
      <line className="fin-buffer" x1={L} x2={W - 8} y1={y(buffer)} y2={y(buffer)} />
      <text x={4} y={y(buffer) - 4}>
        {fmtCents(buffer)}
      </text>
      <text x={4} y={y(0) + 12}>
        $0
      </text>
      <path className="fin-line" d={days.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.balanceCents)}`).join(" ")} />
      {days.map((d, i) =>
        d.flags.includes("overdraft") ? (
          <path key={d.date} className="fin-od" d={`M${x(i)},${y(d.balanceCents) - 6} l5,10 h-10z`} />
        ) : d.flags.includes("low") ? (
          <circle key={d.date} className="fin-low" cx={x(i)} cy={y(d.balanceCents)} r={4} />
        ) : null,
      )}
      {ticks.map((i) => (
        <text key={i} x={Math.min(x(i) - 14, W - 40)} y={H - 6}>
          {format(fromYmd(days[i].date), "d MMM")}
        </text>
      ))}
    </svg>
  );
}

export function FinanceDashboard({ data }: { data: Data }) {
  const s = useStore();
  const buffer = s.settings.finance.bufferCents;
  const { accounts, schedules, subs, budgets, save, remove } = data;
  const [form, setForm] = useState<Form>(null);
  const [horizon, setHorizon] = useState<"30" | "60" | "90">("60");
  const [method, setMethod] = useState<"503020" | "zero">("503020");
  const today = todayYmd();
  const month = today.slice(0, 7);
  const end = ymd(addDays(fromYmd(today), Number(horizon) - 1));

  const days = useMemo(() => project(accounts, schedules, today, end, buffer), [accounts, schedules, today, end, buffer]);
  const upcoming = useMemo(() => expand(schedules, today, ymd(addDays(fromYmd(today), 30))).slice(0, 8), [schedules, today]);
  const trouble = days.filter((d) => d.flags.length);
  const stale = accounts.filter((a) => a.asOf < today);
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "";
  const run = (p: Promise<void>) => p.catch((e) => toast(String(e)));

  const income = schedules.filter((x) => x.kind === "income").reduce((n, x) => n + monthlyEquivalent(x.cents, x.every), 0);
  const split = split503020(income);
  const thisMonth = budgets.filter((b) => b.month === month);
  const lastMonth = budgets.filter((b) => b.month !== month);
  const planned = (bucket: BudgetRow["bucket"]) => thisMonth.filter((b) => b.bucket === bucket).reduce((n, b) => n + b.cents, 0);
  const zero = zeroBased(
    income,
    thisMonth.map((b) => ({ id: b.id, name: b.name, cents: b.cents })),
  );
  const alerts = dueAlerts(subs, today);
  const subMonthly = subs.reduce((n, r) => n + monthlyCents(r), 0);

  const startMonth = () => {
    const prev = new Map<string, BudgetRow>();
    for (const b of lastMonth)
      if (!prev.has(b.name + b.bucket) || prev.get(b.name + b.bucket)!.month < b.month) prev.set(b.name + b.bucket, b);
    run(
      (async () => {
        for (const p of prev.values())
          await save("budgets", {
            ...p,
            id: uid(),
            month,
            spentCents: 0,
            carriedCents: rollover(p.cents, p.carriedCents ?? 0, p.spentCents),
          });
      })(),
    );
  };

  return (
    <>
      {stale.length > 0 && (
        <div className="alert" role="status" style={{ marginBottom: 12 }}>
          Balances for {stale.map((a) => a.name).join(", ")} are from {format(fromYmd(stale[0].asOf), "d MMM")}. Update them so the
          projection starts from what is in your account today.
        </div>
      )}
      <div className="fin-grid">
        <section className="card fin-wide" aria-label="Projected balance">
          <div className="fin-head">
            <h2>Projected balance</h2>
            <Seg
              value={horizon}
              onChange={setHorizon}
              options={[
                { value: "30", label: "30 days" },
                { value: "60", label: "60 days" },
                { value: "90", label: "90 days" },
              ]}
            />
          </div>
          {accounts.length === 0 ? (
            <div className="muted">Add an account and its balance, then your bills and paydays, to see the next {horizon} days.</div>
          ) : (
            <>
              <div className="fin-big mono">{fmtCents(days[days.length - 1]?.balanceCents ?? 0)}</div>
              <div className="muted">expected on {format(fromYmd(end), "d MMM")} from scheduled bills and paydays only</div>
              <Chart days={days} buffer={buffer} />
              {trouble.length > 0 ? (
                <ul className="fin-list" aria-label="Days to watch">
                  {trouble.slice(0, 6).map((d) => (
                    <li key={d.date}>
                      <span className={"fin-flag " + (d.flags[0] === "overdraft" ? "bad" : "warn")}>
                        {d.flags[0] === "overdraft" ? "Overdrawn" : "Low"}
                      </span>
                      <span>{format(fromYmd(d.date), "EEE d MMM")}</span>
                      <span className="mono">{fmtCents(d.balanceCents)}</span>
                    </li>
                  ))}
                  {trouble.length > 6 && <li className="faint">and {trouble.length - 6} more days</li>}
                </ul>
              ) : (
                <div className="muted">No day drops below {fmtCents(buffer)}.</div>
              )}
            </>
          )}
        </section>

        <section className="card" aria-label="Accounts">
          <div className="fin-head">
            <h2>Accounts</h2>
            <button className="btn sm fin-btn" onClick={() => setForm({ k: "account" })}>
              Add
            </button>
          </div>
          {accounts.map((a) => (
            <div key={a.id} className="fin-row">
              <span>
                {a.name}
                <br />
                <span className="faint">as of {format(fromYmd(a.asOf), "d MMM")}</span>
              </span>
              <span className="mono">{fmtCents(a.openingCents)}</span>
              <Menu
                label={`Actions for ${a.name}`}
                items={[
                  { label: "Update balance", onClick: () => setForm({ k: "account", v: a }) },
                  { label: "Remove", onClick: () => run(remove("accounts", a.id)) },
                ]}
              />
            </div>
          ))}
          <label className="field">
            <span>Warn me below ($)</span>
            <input
              className="input"
              inputMode="decimal"
              defaultValue={buffer / 100}
              onBlur={(e) => {
                const c = parseCents(e.target.value);
                if (c !== null && c >= 0) s.updateSettings((st) => void (st.finance.bufferCents = c));
              }}
            />
          </label>
        </section>

        <section className="card" aria-label="Bills and paydays">
          <div className="fin-head">
            <h2>Bills and paydays</h2>
            <button className="btn sm fin-btn" disabled={!accounts.length} onClick={() => setForm({ k: "schedule" })}>
              Add
            </button>
          </div>
          {upcoming.length === 0 && <div className="muted">Nothing due in the next 30 days.</div>}
          {upcoming.map((i) => (
            <div key={i.id} className="fin-row">
              <span>
                {i.name}
                <br />
                <span className="faint">
                  {format(fromYmd(i.effective), "EEE d MMM")}
                  {i.due !== i.effective && ` (due ${format(fromYmd(i.due), "d MMM")}, weekend)`} · {nameOf(i.accountId)}
                </span>
              </span>
              <span className={"mono " + (i.kind === "income" ? "fin-in" : "")}>
                {i.kind === "income" ? "+" : "-"}
                {fmtCents(i.cents)}
              </span>
            </div>
          ))}
          {schedules.length > 0 && (
            <details>
              <summary className="faint">All {schedules.length} schedules</summary>
              {schedules.map((x) => (
                <div key={x.id} className="fin-row">
                  <span>
                    {x.name} <span className="faint">{x.every}</span>
                  </span>
                  <span className="mono">{fmtCents(x.cents)}</span>
                  <Menu
                    label={`Actions for ${x.name}`}
                    items={[
                      { label: "Edit", onClick: () => setForm({ k: "schedule", v: x }) },
                      { label: "Remove", onClick: () => run(remove("schedules", x.id)) },
                    ]}
                  />
                </div>
              ))}
            </details>
          )}
        </section>

        <section className="card fin-wide" aria-label="Subscriptions">
          <div className="fin-head">
            <h2>Subscriptions</h2>
            <span className="faint mono">{fmtCents(subMonthly)} / month</span>
            <span className="spacer" />
            {s.settings.subscriptions.items.length > 0 && (
              <button
                className="btn sm fin-btn"
                onClick={() =>
                  run(
                    (async () => {
                      const known = new Map(subs.map((r) => [r.id, r]));
                      const rows = fromDetected(s.settings.subscriptions.items).map((r) => ({ ...known.get(r.id), ...r }));
                      for (const r of rows) await save("subscriptions", r);
                      toast(`Copied ${rows.length} from your statement scan.`);
                    })(),
                  )
                }
              >
                Copy from statement scan
              </button>
            )}
            <button className="btn sm fin-btn" onClick={() => setForm({ k: "sub" })}>
              Add
            </button>
          </div>
          {alerts.map((a) => (
            <div key={a.id} className="alert" role="status">
              <b>{a.name}</b> {a.kind === "trial" ? "trial ends" : "renews"} {format(fromYmd(a.date), "EEE d MMM")} for {fmtCents(a.cents)}.
            </div>
          ))}
          {subs.length === 0 && (
            <div className="muted">No subscriptions yet. Add one, or copy the ones found by a bank statement scan.</div>
          )}
          {[...subs]
            .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
            .map((r) => (
              <div key={r.id} className="fin-row">
                <span>
                  {r.name}
                  <br />
                  <span className="faint">
                    next {format(fromYmd(r.nextDate), "d MMM")} · {r.cadence}
                    {r.trialEnds && ` · trial ends ${format(fromYmd(r.trialEnds), "d MMM")}`}
                  </span>
                </span>
                {r.previousCents !== undefined && isPriceHike(r.previousCents, r.cents) && (
                  <span className="fin-flag bad">Price up {hikePercent(r.previousCents, r.cents)}%</span>
                )}
                <span className="mono">{fmtCents(r.cents)}</span>
                <Menu
                  label={`Actions for ${r.name}`}
                  items={[
                    { label: "Edit", onClick: () => setForm({ k: "sub", v: r }) },
                    { label: "Remove", onClick: () => run(remove("subscriptions", r.id)) },
                  ]}
                />
              </div>
            ))}
        </section>

        <section className="card fin-wide" aria-label="Budget">
          <div className="fin-head">
            <h2>Budget for {format(fromYmd(today), "MMMM")}</h2>
            <span className="spacer" />
            {thisMonth.length === 0 && lastMonth.length > 0 && (
              <button className="btn sm fin-btn" onClick={startMonth}>
                Start this month (carry over)
              </button>
            )}
            <button className="btn sm fin-btn" onClick={() => setForm({ k: "budget" })}>
              Add envelope
            </button>
          </div>
          <Seg
            value={method}
            onChange={setMethod}
            options={[
              { value: "503020", label: "50/30/20" },
              { value: "zero", label: "Zero-based" },
            ]}
          />
          {income <= 0 ? (
            <div className="muted">Add a payday to plan against your income.</div>
          ) : method === "503020" ? (
            <div className="muted">
              Monthly income about {fmtCents(income)}: needs {fmtCents(split.needs)}, wants {fmtCents(split.wants)}, savings{" "}
              {fmtCents(split.savings)}. Planned so far: needs {fmtCents(planned("needs"))}, wants {fmtCents(planned("wants"))}, savings{" "}
              {fmtCents(planned("savings"))}.
            </div>
          ) : (
            <div className={zero.leftCents < 0 ? "alert bad" : "muted"} role="status">
              {zero.balanced
                ? `Every dollar of your ${fmtCents(income)} monthly income has a job.`
                : zero.leftCents > 0
                  ? `${fmtCents(zero.leftCents)} of your ${fmtCents(income)} monthly income is not assigned yet.`
                  : `You have planned ${fmtCents(-zero.leftCents)} more than your ${fmtCents(income)} monthly income.`}
            </div>
          )}
          {thisMonth.map((b) => {
            const budget = b.cents + (b.carriedCents ?? 0);
            const p = pace(b.spentCents, budget, new Date());
            const over = p.status === "over" && b.bucket !== "savings";
            const pct = budget > 0 ? Math.min(100, (b.spentCents / budget) * 100) : 0;
            return (
              <div key={b.id} className="fin-env">
                <div className="fin-head">
                  <b>{b.name}</b>
                  <span className="faint">{b.bucket}</span>
                  <span className="spacer" />
                  <span className={"fin-flag " + (over ? "bad" : "ok")}>
                    {b.bucket === "savings" ? (p.status === "over" ? "Ahead" : "Behind") : over ? "Over pace" : "Under pace"}
                  </span>
                  <Menu label={`Actions for ${b.name}`} items={[{ label: "Remove", onClick: () => run(remove("budgets", b.id)) }]} />
                </div>
                <div
                  className="fin-gauge"
                  role="img"
                  aria-label={`${fmtCents(b.spentCents)} of ${fmtCents(budget)}, ${over ? "over" : "under"} pace`}
                >
                  <i className={over ? "bad" : "ok"} style={{ width: `${pct}%` }} />
                  <s style={{ left: `${p.elapsed * 100}%` }} />
                </div>
                <div className="fin-row">
                  <span className="mono">
                    {fmtCents(b.spentCents)} of {fmtCents(budget)}
                    {(b.carriedCents ?? 0) !== 0 && <span className="faint"> (carried {fmtCents(b.carriedCents ?? 0)})</span>}
                  </span>
                  <label className="row">
                    <span className="faint">Spent so far ($)</span>
                    <input
                      className="input fin-spent"
                      inputMode="decimal"
                      defaultValue={b.spentCents / 100}
                      onBlur={(e) => {
                        const c = parseCents(e.target.value);
                        if (c !== null && c !== b.spentCents) run(save("budgets", { ...b, spentCents: c }));
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </section>
        <GoalsTile data={data} />
        <TransactionsTile data={data} />
      </div>

      {form?.k === "account" && (
        <AccountForm existing={form.v} onClose={() => setForm(null)} onSave={(a) => (setForm(null), run(save("accounts", a)))} />
      )}
      {form?.k === "schedule" && (
        <ScheduleForm
          accounts={accounts}
          existing={form.v}
          onClose={() => setForm(null)}
          onSave={(x) => (setForm(null), run(save("schedules", x)))}
        />
      )}
      {form?.k === "sub" && (
        <SubForm existing={form.v} onClose={() => setForm(null)} onSave={(r) => (setForm(null), run(save("subscriptions", r)))} />
      )}
      {form?.k === "budget" && (
        <BudgetForm month={month} onClose={() => setForm(null)} onSave={(b) => (setForm(null), run(save("budgets", b)))} />
      )}
    </>
  );
}
