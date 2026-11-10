import { useState } from "react";
import { format } from "date-fns";
import { toast } from "../../store";
import { dueLabel, dueState, money } from "../../lib/mail/bills";
import { billToCalendar, billToTask, markPaid, paidBills, setOverride, unpaidBills, useMail } from "../../lib/mail/engine";
import type { MailMessage } from "../../lib/mail/types";

/** The Bills tab: things to pay, with the amount and due date read from the email. Marking paid is local to this app. */
export function Bills() {
  const messages = useMail((m) => m.messages);
  const [showPaid, setShowPaid] = useState(false);
  const unpaid = unpaidBills(messages);
  const paid = paidBills(messages);
  const total = unpaid.reduce((n, b) => n + (b.amount ?? 0), 0);
  const overdue = unpaid.filter((b) => dueState(b.dueDate).state === "overdue").length;
  const rows = showPaid ? paid : unpaid;

  const run = (fn: () => Promise<unknown>, ok: string) =>
    fn().then(
      () => toast(ok),
      (e: Error) => toast(e.message),
    );
  const view = (m: MailMessage) => useMail.setState({ selectedId: m.id, tab: "mail" });

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div role="status">
          <b>{unpaid.length}</b> unpaid
          {total ? (
            <>
              {" "}
              · <b className="mono">{money(total)}</b>
            </>
          ) : null}
          {overdue ? <span style={{ color: "var(--bad)" }}> · {overdue} overdue</span> : null}
        </div>
        <div className="seg" role="group" aria-label="Bills to show">
          <button aria-pressed={!showPaid} onClick={() => setShowPaid(false)}>
            Unpaid {unpaid.length}
          </button>
          <button aria-pressed={showPaid} onClick={() => setShowPaid(true)}>
            Paid {paid.length}
          </button>
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {rows.map((b) => {
          const st = dueState(b.dueDate);
          return (
            <article key={b.id} className="card bill" aria-label={`${b.from.name || b.from.address}, ${b.subject}`}>
              <div className="bill-main">
                <div style={{ minWidth: 0 }}>
                  <b className="ellipsis">{b.from.name || b.from.address}</b>
                  <div className="muted ellipsis">{b.subject}</div>
                </div>
                <div className="bill-amount mono">{b.amount ? money(b.amount) : "Amount not found"}</div>
                <div
                  className="mono"
                  style={{
                    fontSize: 12.5,
                    color:
                      !showPaid && (st.state === "overdue" || st.state === "today")
                        ? "var(--bad)"
                        : st.state === "soon"
                          ? "var(--warn)"
                          : undefined,
                  }}
                >
                  {showPaid ? `Paid ${b.paidAt ? format(b.paidAt, "d MMM") : ""}` : dueLabel(b.dueDate)}
                  {b.dueDate ? <span className="faint"> · {format(new Date(b.dueDate + "T00:00"), "d MMM yyyy")}</span> : null}
                </div>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {showPaid ? (
                  <button className="btn sm" onClick={() => run(() => markPaid(b.id, false), "Moved back to unpaid.")}>
                    Undo paid
                  </button>
                ) : (
                  <>
                    <button
                      className="btn sm primary"
                      onClick={() => run(() => markPaid(b.id), "Marked as paid. It's off Home and out of alerts.")}
                    >
                      Mark as paid
                    </button>
                    <button
                      className="btn sm"
                      disabled={!b.dueDate || !!b.linked?.eventId}
                      onClick={() => run(() => billToCalendar(b.id), "Added to your Calendar.")}
                    >
                      {b.linked?.eventId ? "In Calendar ✓" : "Add to Calendar"}
                    </button>
                    <button
                      className="btn sm"
                      disabled={!b.dueDate || !!b.linked?.taskId}
                      onClick={() => run(() => billToTask(b.id), "Added to your Tasks.")}
                    >
                      {b.linked?.taskId ? "In Tasks ✓" : "Add as task"}
                    </button>
                  </>
                )}
                <button className="btn sm ghost" onClick={() => view(b)}>
                  View email
                </button>
                {!showPaid && (
                  <button className="btn sm ghost" onClick={() => run(() => setOverride(b.id, { bill: false }), "Removed from Bills.")}>
                    Not a bill
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!rows.length && (
          <div className="card empty">
            {showPaid ? "Nothing marked as paid yet." : "No unpaid bills. Bills and invoices from your email appear here."}
          </div>
        )}
      </div>
      {!showPaid && unpaid.length > 0 && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          “Paid” is tracked in this app only. It doesn't pay anything or change your mailbox.
        </div>
      )}
    </div>
  );
}
