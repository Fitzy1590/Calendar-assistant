import { format } from "date-fns";
import { useRef, useState } from "react";
import { Menu } from "../ui";
import { GoalForm } from "./FinanceForms";
import type { useFinanceData } from "./useFinanceData";
import { parseStatement } from "../../lib/bankStatement";
import { goalPlan } from "../../lib/finance/budgetCalculator";
import { fmtCents } from "../../lib/finance/money";
import { spentByEnvelope, toRows, unsortedMerchants } from "../../lib/finance/statementImport";
import { putRows } from "../../lib/finance/vault";
import { fromYmd, todayYmd } from "../../lib/util";
import { toast } from "../../store";
import type { Goal } from "../../lib/finance/types";
import { merchantKey } from "../../lib/subscriptions";

type Data = ReturnType<typeof useFinanceData>;

export function GoalsTile({ data }: { data: Data }) {
  const [form, setForm] = useState<{ v?: Goal } | null>(null);
  const run = (p: Promise<void>) => p.catch((e) => toast(String(e)));
  return (
    <section className="card" aria-label="Savings goals">
      <div className="fin-head">
        <h2>Savings goals</h2>
        <button className="btn sm fin-btn" onClick={() => setForm({})}>
          Add
        </button>
      </div>
      {data.goals.length === 0 && <div className="muted">Add something to save for and see what to put aside each month.</div>}
      {data.goals.map((g) => {
        const p = goalPlan(g, new Date());
        const pct = Math.min(100, (g.savedCents / g.targetCents) * 100);
        return (
          <div key={g.id} className="fin-env">
            <div className="fin-head">
              <b>{g.name}</b>
              <span className="spacer" />
              {p.done && <span className="fin-flag ok">Reached</span>}
              {p.late && <span className="fin-flag bad">Past date</span>}
              <Menu
                label={`Actions for ${g.name}`}
                items={[
                  { label: "Edit", onClick: () => setForm({ v: g }) },
                  { label: "Remove", onClick: () => run(data.remove("savings_goals", g.id)) },
                ]}
              />
            </div>
            <div className="fin-gauge" role="img" aria-label={`${fmtCents(g.savedCents)} of ${fmtCents(g.targetCents)} saved`}>
              <i className="ok" style={{ width: `${pct}%` }} />
            </div>
            <div className="muted mono">
              {fmtCents(g.savedCents)} of {fmtCents(g.targetCents)}
              {p.perMonthCents !== null &&
                !p.done &&
                g.targetDate &&
                ` · ${fmtCents(p.perMonthCents)} a month to reach it by ${format(fromYmd(g.targetDate), "d MMM yyyy")}`}
            </div>
          </div>
        );
      })}
      {form && (
        <GoalForm existing={form.v} onClose={() => setForm(null)} onSave={(g) => (setForm(null), run(data.save("savings_goals", g)))} />
      )}
    </section>
  );
}

/** Import a bank statement into the encrypted vault and sort spending into envelopes. Nothing leaves this PC. */
export function TransactionsTile({ data }: { data: Data }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const month = todayYmd().slice(0, 7);
  const envelopes = data.budgets.filter((b) => b.month === month);
  const merchants = unsortedMerchants(data.txns).slice(0, 6);

  const load = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("That file is too big for a statement (over 20 MB).");
      const txns = parseStatement(await f.text(), f.name);
      if (!txns.length)
        throw new Error("I couldn't read any transactions from that file. Try the CSV, OFX or QIF download from your bank.");
      const have = new Set(data.txns.map((t) => t.id));
      const fresh = toRows(txns).filter((r) => !have.has(r.id));
      if (fresh.length) await putRows("transactions", fresh);
      await data.reload();
      toast(`Read ${txns.length} lines, ${fresh.length} new. Saved encrypted on this PC only.`);
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  const assign = async (key: string, envelopeId: string) => {
    try {
      const rows = data.txns.filter((t) => !t.envelopeId && t.cents < 0 && merchantKey(t.desc) === key).map((t) => ({ ...t, envelopeId }));
      await putRows("transactions", rows);
      const all = data.txns.map((t) => rows.find((r) => r.id === t.id) ?? t);
      const spent = spentByEnvelope(all, month);
      const env = envelopes.find((e) => e.id === envelopeId);
      if (env) await data.save("budgets", { ...env, spentCents: spent.get(envelopeId) ?? 0 });
      else await data.reload();
    } catch (e) {
      toast(String(e));
    }
  };

  return (
    <section className="card fin-wide" aria-label="Statement">
      <div className="fin-head">
        <h2>Statement</h2>
        <span className="faint">{data.txns.length} lines saved</span>
        <span className="spacer" />
        <button className="btn sm fin-btn" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? "Reading…" : "Import a statement"}
        </button>
      </div>
      <input
        ref={file}
        type="file"
        hidden
        accept=".csv,.ofx,.qfx,.qif,.txt"
        onChange={(e) => void load(e.target.files?.[0])}
        aria-label="Bank statement file"
      />
      <div className="faint" style={{ fontSize: 12.5 }}>
        The file is read on this PC and its lines are kept only in the encrypted finance file: not synced, not in backups, never sent
        anywhere.
      </div>
      {merchants.length > 0 && envelopes.length === 0 && (
        <div className="muted">Add an envelope in the budget to start sorting spending.</div>
      )}
      {merchants.length > 0 && envelopes.length > 0 && (
        <div role="group" aria-label="Spending to sort">
          {merchants.map((m) => (
            <div key={m.key} className="fin-row">
              <span>
                {m.label}
                <br />
                <span className="faint">
                  {m.count} payment{m.count === 1 ? "" : "s"}
                </span>
              </span>
              <span className="mono">{fmtCents(m.totalCents)}</span>
              <select
                className="input fin-spent"
                aria-label={`Envelope for ${m.label}`}
                value=""
                onChange={(e) => e.target.value && void assign(m.key, e.target.value)}
              >
                <option value="">Sort into…</option>
                {envelopes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
