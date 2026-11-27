import { useState } from "react";
import { Field, Modal } from "../ui";
import { parseCents } from "../../lib/finance/money";
import type { BudgetRow, Every, FinAccount, Schedule } from "../../lib/finance/types";
import type { SubRecord } from "../../lib/finance/subscriptionTracker";
import { todayYmd, uid } from "../../lib/util";

/** Small add forms for the Finance page. Amounts are typed in dollars and stored as whole cents. */

const EVERY: { value: Every; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every fortnight" },
  { value: "monthly", label: "Every month" },
  { value: "yearly", label: "Every year" },
];

function Shell({
  title,
  onClose,
  onSave,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => string | null;
  children: React.ReactNode;
}) {
  const [err, setErr] = useState("");
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => setErr(onSave() ?? "")}>
            Save
          </button>
        </>
      }
    >
      {children}
      {err && (
        <div className="alert bad" role="alert">
          {err}
        </div>
      )}
    </Modal>
  );
}

export function AccountForm({
  existing,
  onSave,
  onClose,
}: {
  existing?: FinAccount;
  onSave: (a: FinAccount) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [bal, setBal] = useState(existing ? String(existing.openingCents / 100) : "");
  return (
    <Shell
      title={existing ? "Update balance" : "Add an account"}
      onClose={onClose}
      onSave={() => {
        const c = parseCents(bal);
        if (!name.trim()) return "Give the account a name.";
        if (c === null) return "Enter the balance as a number, like 1420.50.";
        onSave({ id: existing?.id ?? uid(), name: name.trim(), openingCents: c, asOf: todayYmd() });
        return null;
      }}
    >
      <Field label="Account name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Everyday" />
      </Field>
      <Field label="Balance right now ($)">
        <input className="input" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} placeholder="1420.00" />
      </Field>
    </Shell>
  );
}

export function ScheduleForm({
  accounts,
  existing,
  onSave,
  onClose,
}: {
  accounts: FinAccount[];
  existing?: Schedule;
  onSave: (s: Schedule) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Schedule["kind"]>(existing?.kind ?? "bill");
  const [name, setName] = useState(existing?.name ?? "");
  const [amt, setAmt] = useState(existing ? String(existing.cents / 100) : "");
  const [start, setStart] = useState(existing?.start ?? todayYmd());
  const [every, setEvery] = useState<Every>(existing?.every ?? "monthly");
  const [acct, setAcct] = useState(existing?.accountId ?? accounts[0]?.id ?? "");
  return (
    <Shell
      title={existing ? "Edit" : "Add a bill or payday"}
      onClose={onClose}
      onSave={() => {
        const c = parseCents(amt);
        if (!name.trim()) return "Give it a name.";
        if (c === null || c <= 0) return "Enter the amount as a positive number, like 1350.";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "Pick a date.";
        if (!acct) return "Add an account first.";
        onSave({ id: existing?.id ?? uid(), accountId: acct, name: name.trim(), kind, cents: c, start, every });
        return null;
      }}
    >
      <div className="seg" role="group" aria-label="Type">
        {(["bill", "income"] as const).map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === "bill" ? "Bill" : "Payday"}
          </button>
        ))}
      </div>
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "bill" ? "Rent" : "Salary"} />
      </Field>
      <Field label="Amount ($)">
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </Field>
      <Field label="First date">
        <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="Repeats">
        <select className="input" value={every} onChange={(e) => setEvery(e.target.value as Every)}>
          {EVERY.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Account">
        <select className="input" value={acct} onChange={(e) => setAcct(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="faint" style={{ fontSize: 12.5 }}>
        On a weekend a payday counts on the Friday before and a bill on the Monday after.
      </div>
    </Shell>
  );
}

export function SubForm({ existing, onSave, onClose }: { existing?: SubRecord; onSave: (s: SubRecord) => void; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [amt, setAmt] = useState(existing ? String(existing.cents / 100) : "");
  const [cadence, setCadence] = useState<SubRecord["cadence"]>(existing?.cadence ?? "monthly");
  const [next, setNext] = useState(existing?.nextDate ?? todayYmd());
  const [trial, setTrial] = useState(existing?.trialEnds ?? "");
  return (
    <Shell
      title={existing ? "Edit subscription" : "Add a subscription"}
      onClose={onClose}
      onSave={() => {
        const c = parseCents(amt);
        if (!name.trim()) return "Give it a name.";
        if (c === null || c <= 0) return "Enter the charge as a positive number, like 22.99.";
        const changed = existing && existing.cents !== c;
        onSave({
          ...(existing ?? { id: uid() }),
          name: name.trim(),
          cents: c,
          previousCents: changed ? existing.cents : existing?.previousCents,
          cadence,
          nextDate: next,
          trialEnds: trial || undefined,
        });
        return null;
      }}
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Charge ($)">
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </Field>
      <Field label="Billed">
        <select className="input" value={cadence} onChange={(e) => setCadence(e.target.value as SubRecord["cadence"])}>
          <option value="weekly">Every week</option>
          <option value="fortnightly">Every fortnight</option>
          <option value="monthly">Every month</option>
          <option value="quarterly">Every 3 months</option>
          <option value="yearly">Every year</option>
        </select>
      </Field>
      <Field label="Next charge">
        <input className="input" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Free trial ends (optional)">
        <input className="input" type="date" value={trial} onChange={(e) => setTrial(e.target.value)} />
      </Field>
    </Shell>
  );
}

export function BudgetForm({ month, onSave, onClose }: { month: string; onSave: (b: BudgetRow) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [bucket, setBucket] = useState<BudgetRow["bucket"]>("needs");
  const [amt, setAmt] = useState("");
  return (
    <Shell
      title="Add an envelope"
      onClose={onClose}
      onSave={() => {
        const c = parseCents(amt);
        if (!name.trim()) return "Give it a name, like Groceries.";
        if (c === null || c < 0) return "Enter the monthly amount as a number.";
        onSave({ id: uid(), name: name.trim(), bucket, cents: c, spentCents: 0, month });
        return null;
      }}
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries" />
      </Field>
      <Field label="Group">
        <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value as BudgetRow["bucket"])}>
          <option value="needs">Needs (50%)</option>
          <option value="wants">Wants (30%)</option>
          <option value="savings">Savings (20%)</option>
        </select>
      </Field>
      <Field label="Monthly amount ($)">
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </Field>
    </Shell>
  );
}
