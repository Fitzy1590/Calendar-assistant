import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast, useStore } from "../../store";
import { allowSending } from "../../lib/mail/accounts";
import { ask, draftPrompt, ideasPrompt, parseIdeas, TONES, type AiProvider, type Tone } from "../../lib/mail/ai";
import { allMessages } from "../../lib/mail/cache";
import {
  canSendNow,
  checkBeforeSend,
  fillTemplate,
  GRAPH_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_BYTES,
  ownText,
  parseRecipients,
  recipientsText,
  withDraft,
  type OutgoingMail,
} from "../../lib/mail/compose";
import { snoozeOptions } from "../../lib/mail/followups";
import { queueSend } from "../../lib/mail/outbox";
import { buildThreadContext, type ThreadContext } from "../../lib/mail/thread";
import { Field, Modal, Seg } from "../ui";

const QUICK = ["Thanks, got it.", "Sounds good.", "I'll get back to you shortly."];

const readFile = (f: File) =>
  new Promise<{ name: string; mime: string; data: string; size: number }>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () =>
      resolve({ name: f.name, mime: f.type || "application/octet-stream", data: String(r.result).split(",")[1] ?? "", size: f.size });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });

/** Write, reply or forward. Draft with Claude or Gemini if you like; nothing is sent until you press Send. */
export function Compose({ draft, onClose, autoDraft }: { draft: OutgoingMail; onClose: () => void; autoDraft?: AiProvider }) {
  const s = useStore();
  const mail = s.settings.mail;
  const keys = {
    claude: s.settings.assistant.apiKey,
    gemini: s.settings.assistant.geminiKey,
    geminiModel: s.settings.assistant.geminiModel,
  };
  const [d, setD] = useState<OutgoingMail>(draft);
  const [to, setTo] = useState(recipientsText(draft.to));
  const [cc, setCc] = useState(recipientsText(draft.cc));
  const [bcc, setBcc] = useState(recipientsText(draft.bcc));
  const [showCc, setShowCc] = useState(draft.cc.length > 0);
  const [tone, setTone] = useState<Tone>("friendly");
  const [notes, setNotes] = useState("");
  const [ai, setAi] = useState<{ who?: AiProvider; busy: boolean; error?: string }>({ busy: false });
  const [confirm, setConfirm] = useState<{ who: AiProvider; ctx: ThreadContext; then: "draft" | "ideas" } | null>(null);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [later, setLater] = useState(false);
  const [followUp, setFollowUp] = useState(0);
  const [askDiscard, setAskDiscard] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const account = mail.accounts.find((a) => a.id === d.accountId);
  const signature = mail.signatures[d.accountId] ?? "";
  const dirty = d.body !== draft.body || to !== recipientsText(draft.to) || d.subject !== draft.subject || d.attachments.length > 0;
  const close = () => (dirty ? setAskDiscard(true) : onClose());
  const contacts = useMemo(() => new Set(Object.values(s.contacts).flatMap((c) => (c.email ? [c.email.toLowerCase()] : []))), [s.contacts]);
  const current = (): OutgoingMail => ({ ...d, to: parseRecipients(to), cc: parseRecipients(cc), bcc: parseRecipients(bcc) });
  const checks = checkBeforeSend(current(), contacts);
  const hasKey = (w: AiProvider) => !!(w === "claude" ? keys.claude : keys.gemini);

  const threadContext = async (): Promise<ThreadContext> => {
    const thread = d.reply ? (await allMessages()).filter((m) => m.accountId === d.accountId && m.threadId === d.reply!.threadId) : [];
    return buildThreadContext(thread, account?.address ?? "");
  };

  const runAi = async (who: AiProvider, ctx: ThreadContext, what: "draft" | "ideas") => {
    setAi({ who, busy: true });
    try {
      if (what === "draft") {
        const out = await ask(who, draftPrompt({ thread: ctx.text, tone, notes }), keys);
        setD((x) => ({ ...x, body: withDraft(x.body, out, signature) }));
      } else {
        setIdeas(parseIdeas(await ask(who, ideasPrompt(ctx.text), keys)));
      }
      setAi({ busy: false });
    } catch (e) {
      setAi({ busy: false, error: (e as Error).message });
    }
  };

  /** The first time for each AI, show exactly what will be sent and ask. */
  const useAi = async (who: AiProvider, what: "draft" | "ideas") => {
    if (!hasKey(who))
      return setAi({ busy: false, error: `Add your ${who === "claude" ? "Anthropic" : "Gemini"} key in Settings → Assistant first.` });
    const ctx = await threadContext();
    if (!ctx.text.trim()) return setAi({ busy: false, error: "There's no message to base a draft on." });
    if (!mail.aiConfirmed[who]) return setConfirm({ who, ctx, then: what });
    void runAi(who, ctx, what);
  };

  const attach = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const total = d.attachments.reduce((n, a) => n + a.size, 0) + f.size;
      if (total > MAX_ATTACHMENT_BYTES) return toast("Attachments can total up to 10 MB.");
      if (account?.provider === "graph" && total > GRAPH_ATTACHMENT_BYTES) return toast("Outlook accepts attachments up to 3 MB here.");
      const a = await readFile(f);
      setD((x) => ({ ...x, attachments: [...x.attachments, a] }));
    }
  };

  const send = async (at?: number) => {
    setReview(false);
    setLater(false);
    const delay = at ? Math.max(0, at - Date.now()) : mail.undoSeconds * 1000;
    await queueSend(current(), delay, followUp || undefined);
    toast(at ? `Scheduled for ${format(at, "EEE d MMM, h:mm a")}.` : "Sending…");
    onClose();
  };

  // "Draft reply with Claude/Gemini" from the right-click menu starts drafting as soon as the window opens
  useEffect(() => {
    if (autoDraft) void useAi(autoDraft, "draft");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const press = () => (checks.some((c) => c.level !== "ok") ? setReview(true) : void send());
  const blocked = !canSendNow(checks);

  return (
    <>
      <Modal
        wide
        title={d.mode === "forward" ? "Forward" : d.mode === "new" ? "New email" : "Reply"}
        onClose={close}
        footer={
          askDiscard ? (
            <>
              <span style={{ marginRight: "auto" }}>Discard this draft?</span>
              <button className="btn" onClick={() => setAskDiscard(false)}>
                Keep editing
              </button>
              <button className="btn primary" onClick={onClose}>
                Discard
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={close}>
                Discard
              </button>
              <span style={{ flex: 1 }} />
              <label className="row muted" style={{ fontSize: 13 }}>
                Remind me if no reply in
                <select
                  className="input"
                  style={{ width: "auto" }}
                  value={followUp}
                  onChange={(e) => setFollowUp(Number(e.target.value))}
                  aria-label="Follow-up reminder"
                >
                  <option value={0}>never</option>
                  <option value={1}>1 day</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                </select>
              </label>
              <button className="btn" onClick={() => setLater((v) => !v)} aria-expanded={later}>
                Send later…
              </button>
              <button className="btn primary" disabled={blocked || !account?.canSend} onClick={press}>
                Send
              </button>
            </>
          )
        }
      >
        <div className="stack" style={{ gap: 10 }}>
          {account && !account.canSend && (
            <div className="alert bad row" role="alert" style={{ flexWrap: "wrap" }}>
              <span>This account hasn't been allowed to send yet.</span>
              <button
                className="btn sm primary"
                onClick={() =>
                  allowSending(account).then(
                    () => toast("Sending allowed."),
                    (e: Error) => toast(e.message),
                  )
                }
              >
                Allow sending
              </button>
            </div>
          )}
          {mail.accounts.length > 1 && (
            <Field label="From">
              <select className="input" value={d.accountId} onChange={(e) => setD({ ...d, accountId: e.target.value })}>
                {mail.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.address}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="To">
            <input
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com, …"
              autoFocus={d.mode === "new" || d.mode === "forward"}
            />
          </Field>
          {!showCc && (
            <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setShowCc(true)}>
              Add Cc / Bcc
            </button>
          )}
          {showCc && (
            <>
              <Field label="Cc">
                <input className="input" value={cc} onChange={(e) => setCc(e.target.value)} />
              </Field>
              <Field label="Bcc">
                <input className="input" value={bcc} onChange={(e) => setBcc(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Subject">
            <input className="input" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
          </Field>

          <div className="row" style={{ flexWrap: "wrap" }}>
            <select
              className="input"
              style={{ width: "auto" }}
              aria-label="Insert a template"
              value=""
              onChange={(e) => {
                const t = mail.templates.find((x) => x.id === e.target.value);
                if (t) setD((x) => ({ ...x, body: withDraft(x.body, fillTemplate(t, parseRecipients(to)[0]), signature) }));
              }}
            >
              <option value="">Template…</option>
              {mail.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="btn sm" onClick={() => file.current?.click()}>
              Attach file
            </button>
            <input ref={file} type="file" multiple hidden onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ""))} />
            <span className="muted" style={{ fontSize: 13 }}>
              Draft with
            </span>
            <button className="btn sm" disabled={ai.busy} onClick={() => void useAi("claude", "draft")}>
              Claude
            </button>
            <button className="btn sm" disabled={ai.busy} onClick={() => void useAi("gemini", "draft")}>
              Gemini
            </button>
            <Seg value={tone} options={TONES.map((t) => ({ value: t.id, label: t.label }))} onChange={setTone} />
          </div>
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional: what you want to say, e.g. “say yes, ask for the quote by Friday”"
            aria-label="What you want the draft to say"
          />
          {ai.busy && <div className="muted">Drafting with {ai.who === "claude" ? "Claude" : "Gemini"}…</div>}
          {ai.error && (
            <div className="alert bad" role="alert">
              {ai.error}
            </div>
          )}

          {d.reply && (
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }} role="group" aria-label="Quick replies">
              {QUICK.map((q) => (
                <button key={q} className="chip" onClick={() => setD((x) => ({ ...x, body: withDraft(x.body, q, signature) }))}>
                  {q}
                </button>
              ))}
              {ideas.map((q) => (
                <button key={q} className="chip" onClick={() => setD((x) => ({ ...x, body: withDraft(x.body, q, signature) }))}>
                  {q}
                </button>
              ))}
              <button
                className="btn sm ghost"
                disabled={ai.busy}
                onClick={() => void useAi(hasKey("claude") ? "claude" : "gemini", "ideas")}
              >
                More ideas
              </button>
            </div>
          )}

          <textarea
            className="input"
            rows={12}
            value={d.body}
            onChange={(e) => setD({ ...d, body: e.target.value })}
            aria-label="Message"
            style={{ fontFamily: "inherit", resize: "vertical" }}
          />
          {d.attachments.length > 0 && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              {d.attachments.map((a, i) => (
                <span key={a.name + i} className="chip" aria-pressed>
                  {a.name} · {Math.max(1, Math.round(a.size / 1024))} KB{" "}
                  <button
                    className="btn sm ghost"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => setD((x) => ({ ...x, attachments: x.attachments.filter((_, j) => j !== i) }))}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          {later && (
            <div className="card stack" style={{ gap: 6 }} role="group" aria-label="Send later">
              <div className="eyebrow">Send later</div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {snoozeOptions().map((o) => (
                  <button key={o.at} className="btn sm" disabled={blocked} onClick={() => void send(o.at)}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="row">
                <input className="input" type="datetime-local" id="send-at" style={{ width: "auto" }} aria-label="Pick a date and time" />
                <button
                  className="btn sm"
                  disabled={blocked}
                  onClick={() => {
                    const v = (document.getElementById("send-at") as HTMLInputElement | null)?.value;
                    const t = v ? new Date(v).getTime() : NaN;
                    if (!Number.isFinite(t) || t < Date.now()) return toast("Pick a time in the future.");
                    void send(t);
                  }}
                >
                  Schedule
                </button>
              </div>
              <div className="faint" style={{ fontSize: 12.5 }}>
                It goes out at that time if Calendar Assistant is running (it can stay in the tray), or the next time you open it.
              </div>
            </div>
          )}
          <div className="faint" style={{ fontSize: 12.5 }}>
            Drafts from Claude or Gemini are suggestions in this box. Nothing is sent until you press Send; after that you have{" "}
            {mail.undoSeconds} seconds to undo.
          </div>
        </div>
      </Modal>

      {confirm && (
        <Modal
          title={`Send this to ${confirm.who === "claude" ? "Claude" : "Gemini"}?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  const c = confirm;
                  s.updateSettings((st) => void (st.mail.aiConfirmed[c.who] = true));
                  setConfirm(null);
                  void runAi(c.who, c.ctx, c.then);
                }}
              >
                Send and don't ask again
              </button>
            </>
          }
        >
          <div className="stack">
            <div className="muted">
              To write a draft, this text from the last {confirm.ctx.count} message{confirm.ctx.count === 1 ? "" : "s"} goes to{" "}
              {confirm.who === "claude" ? "Anthropic (Claude)" : "Google (Gemini)"}. Quoted replies and signatures are removed and card
              numbers, long numbers and link tokens are hidden{confirm.ctx.hidden ? ` (${confirm.ctx.hidden} hidden here)` : ""}.
            </div>
            <pre
              className="card"
              style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: 13, maxHeight: 280, overflow: "auto" }}
            >
              {confirm.ctx.text}
            </pre>
          </div>
        </Modal>
      )}

      {review && (
        <Modal
          title="Before you send"
          onClose={() => setReview(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setReview(false)}>
                Fix it
              </button>
              <button className="btn primary" disabled={blocked} onClick={() => void send()}>
                Send anyway
              </button>
            </>
          }
        >
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            {checks.map((c, i) => (
              <li key={i} style={{ color: c.level === "ok" ? undefined : c.level === "warn" ? "var(--warn)" : "var(--bad)" }}>
                {c.level === "ok" ? "✓ " : c.level === "warn" ? "! " : "✕ "}
                {c.text}
              </li>
            ))}
          </ul>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>
            What you wrote: {ownText(d.body).trim().slice(0, 140) || "(nothing)"}
          </div>
        </Modal>
      )}
    </>
  );
}
