import { useStore, toast } from "../../store";
import { addSenderRule, dismissSuggestion, markPaid, setOverride } from "../../lib/mail/engine";
import { suggestion, type SenderAction } from "../../lib/mail/rules";
import type { MailMessage } from "../../lib/mail/types";
import { Toggle } from "../ui";

const WHAT: Record<SenderAction, string> = { important: "important", mute: "not important (muted)", bill: "a bill" };

/** In the reader: change how this email, or everything from this sender, is handled. */
export function HandlePanel({ m, onFile }: { m: MailMessage; onFile: () => void }) {
  const s = useStore();
  const who = m.from.name || m.from.address;
  const sug = suggestion(s.settings.mail.suggest, s.settings.mail.rules, m.from.address);
  const imp = m.override?.important;
  const makeRule = (a: SenderAction) =>
    addSenderRule(m, a).then(
      (r) =>
        toast(r.created ? `Rule added: ${r.rule.name}. Edit it in Settings → Email.` : "That rule already exists, and is switched on."),
      (e: Error) => toast(e.message),
    );
  return (
    <section className="stack handle" aria-label="How this email is handled" style={{ gap: 10 }}>
      {sug && (
        <div className="row card" role="status" style={{ flexWrap: "wrap", padding: 10 }}>
          <span>
            You've marked {who} as {WHAT[sug]} a few times. Always do this?
          </span>
          <button className="btn sm primary" onClick={() => makeRule(sug)}>
            Make it a rule
          </button>
          <button className="btn sm ghost" onClick={() => dismissSuggestion(m.from.address)}>
            No thanks
          </button>
        </div>
      )}
      <h4 style={{ margin: 0 }}>Just this email</h4>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="Importance of this email">
          <button aria-pressed={imp === undefined} onClick={() => setOverride(m.id, { important: null })}>
            Automatic
          </button>
          <button aria-pressed={imp === true} onClick={() => setOverride(m.id, { important: true })}>
            Important
          </button>
          <button aria-pressed={imp === false} onClick={() => setOverride(m.id, { important: false })}>
            Not important
          </button>
        </div>
        <span className="row">
          <Toggle checked={!!m.bill} onChange={(v) => setOverride(m.id, { bill: v })} label="Treat as a bill" /> Treat as a bill
        </span>
        {m.bill && !m.paid && (
          <button className="btn sm" onClick={() => markPaid(m.id).then(() => toast("Marked as paid."))}>
            Mark as paid
          </button>
        )}
        {m.bill && m.paid && (
          <button className="btn sm" onClick={() => markPaid(m.id, false)}>
            Undo paid
          </button>
        )}
      </div>
      <h4 style={{ margin: 0 }}>Everything from {who}</h4>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn sm" onClick={onFile}>
          Create rule + folder…
        </button>
        <button className="btn sm" onClick={() => makeRule("important")}>
          Always important + notify
        </button>
        <button className="btn sm" onClick={() => makeRule("mute")}>
          Mute
        </button>
        <button className="btn sm" onClick={() => makeRule("bill")}>
          Send to Bills
        </button>
      </div>
    </section>
  );
}
