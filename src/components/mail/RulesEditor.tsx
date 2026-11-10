import { useMemo, useState } from "react";
import { toast } from "../../store";
import { useStore } from "../../store";
import { deleteRule, saveRule, useMail } from "../../lib/mail/engine";
import { describeRule, matchRule, newRule, parseList, validateRule } from "../../lib/mail/rules";
import type { MailRule } from "../../lib/mail/types";
import { Field, Modal, Suggest, Toggle } from "../ui";
import { RULE_KEYWORDS, senderIdeas } from "../../lib/suggest";

/** Settings → Email: your own rules. */
export function RulesEditor() {
  const rules = useStore((s) => s.settings.mail.rules);
  const [editing, setEditing] = useState<MailRule | null>(null);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rules.map((r) => (
        <div key={r.id} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <span className="row" style={{ minWidth: 0 }}>
            <Toggle checked={r.enabled} onChange={(v) => saveRule({ ...r, enabled: v })} label={`Rule on: ${r.name || describeRule(r)}`} />
            <span style={{ minWidth: 0 }}>
              <b>{r.name || "Rule"}</b>
              <div className="muted" style={{ fontSize: 13 }}>
                {describeRule(r)}
              </div>
            </span>
          </span>
          <span className="row">
            <button className="btn sm" onClick={() => setEditing(r)}>
              Edit
            </button>
            <button className="btn sm ghost" onClick={() => deleteRule(r.id).then(() => toast("Rule deleted."))}>
              Delete
            </button>
          </span>
        </div>
      ))}
      {!rules.length && <div className="muted">No rules yet. Add one here, or use the buttons under any email in the Email page.</div>}
      <div>
        <button className="btn" onClick={() => setEditing(newRule({ important: true }))}>
          Add a rule
        </button>
      </div>
      {editing && <RuleModal start={editing} isNew={!rules.some((r) => r.id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleModal({ start, isNew, onClose }: { start: MailRule; isNew: boolean; onClose: () => void }) {
  const [r, setR] = useState(start);
  const folders = useStore((s) => s.settings.mail.folders);
  const [senders, setSenders] = useState(start.senders.join(", "));
  const [keywords, setKeywords] = useState(start.keywords.join(", "));
  const messages = useMail((m) => m.messages);
  const draft: MailRule = { ...r, senders: parseList(senders), keywords: parseList(keywords) };
  const errors = validateRule(draft);
  const hits = useMemo(() => messages.filter((m) => matchRule(draft, m)), [messages, senders, keywords, r.keywordMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<MailRule>) => setR((x) => ({ ...x, ...p }));
  // mute can't be combined with important / always notify
  const toggle = (k: "important" | "notify" | "mute" | "bill", v: boolean) =>
    set(
      k === "mute" && v
        ? { mute: true, important: false, notify: false }
        : (k === "important" || k === "notify") && v
          ? { [k]: true, mute: false }
          : { [k]: v },
    );
  const save = async () => {
    if (errors.length) return;
    await saveRule(draft);
    toast(isNew ? "Rule added." : "Rule saved.");
    onClose();
  };
  return (
    <Modal
      title={isNew ? "Add a rule" : "Edit rule"}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!errors.length} onClick={save}>
            Save rule
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name (optional)">
          <input className="input" value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Electricity bills" />
        </Field>
        <Field label="From these senders">
          <textarea
            className="input"
            rows={2}
            value={senders}
            onChange={(e) => setSenders(e.target.value)}
            placeholder="boss@work.com, @energyco.com"
            aria-describedby="rule-senders-help"
          />
        </Field>
        <Suggest
          label="From your mail"
          items={senderIdeas(useMail.getState().messages.map((m) => m.from.address))
            .filter((d) => !senders.includes(d))
            .map((d) => ({ label: d, onUse: () => setSenders((x) => (x.trim() ? `${x.trim().replace(/,$/, "")}, ${d}` : d)) }))}
        />
        <div id="rule-senders-help" className="faint" style={{ fontSize: 12.5, marginTop: -6 }}>
          An address, or a domain like @energyco.com for everyone there. Separate with commas.
        </div>
        <Field label="With these words in the subject">
          <input
            className="input"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="invoice, booking, deadline"
          />
        </Field>
        <Suggest
          items={RULE_KEYWORDS.filter((k) => !keywords.toLowerCase().includes(k))
            .slice(0, 6)
            .map((k) => ({
              label: k,
              onUse: () => setKeywords((x) => (x.trim() ? `${x.trim().replace(/,$/, "")}, ${k}` : k)),
            }))}
        />
        <div className="row">
          <span className="muted">Match</span>
          <div className="seg" role="group" aria-label="Keyword matching">
            <button aria-pressed={r.keywordMode === "any"} onClick={() => set({ keywordMode: "any" })}>
              Any word
            </button>
            <button aria-pressed={r.keywordMode === "all"} onClick={() => set({ keywordMode: "all" })}>
              All words
            </button>
          </div>
        </div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          If you give both senders and words, an email must match both. For “either”, make two rules.
        </div>
        <h4 style={{ margin: "4px 0 0" }}>Then</h4>
        <span className="row">
          <Toggle checked={r.important} onChange={(v) => toggle("important", v)} label="Treat as important" /> Treat as important
        </span>
        <span className="row">
          <Toggle checked={r.notify} onChange={(v) => toggle("notify", v)} label="Always notify" /> Always notify when one arrives
        </span>
        <span className="row">
          <Toggle checked={r.mute} onChange={(v) => toggle("mute", v)} label="Mute" /> Mute: never important, no alerts
        </span>
        <span className="row">
          <Toggle checked={r.bill} onChange={(v) => toggle("bill", v)} label="Send to Bills" /> Send to Bills
        </span>
        <Field label="Move to folder (in this app)">
          <select className="input" value={r.folderId ?? ""} onChange={(e) => set({ folderId: e.target.value || undefined })}>
            <option value="">Leave in the Inbox</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        {errors.length > 0 ? (
          <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
            {errors.join(" ")}
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 12.5 }} role="status">
            Matches {hits.length} email{hits.length === 1 ? "" : "s"} right now
            {hits.length
              ? `: ${hits
                  .slice(0, 3)
                  .map((m) => m.subject)
                  .join(" · ")}`
              : ""}
            .
          </div>
        )}
      </div>
    </Modal>
  );
}
