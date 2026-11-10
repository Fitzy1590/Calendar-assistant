import { format } from "date-fns";
import { useMemo, useState } from "react";
import { toast, useStore } from "../../store";
import { ask, parseSummary, summaryPrompt, type AiProvider } from "../../lib/mail/ai";
import { allMessages } from "../../lib/mail/cache";
import { replyTo } from "../../lib/mail/composeStore";
import { snoozeMail } from "../../lib/mail/engine";
import { snoozeOptions } from "../../lib/mail/followups";
import { dateIdeas, type DateIdea } from "../../lib/mail/mailDates";
import { buildThreadContext } from "../../lib/mail/thread";
import type { MailMessage } from "../../lib/mail/types";
import { conflictsFor } from "../../lib/planner";
import { localIso, ymd } from "../../lib/util";

const QUICK = ["Thanks, got it.", "Sounds good.", "I'll get back to you shortly."];

/** Under an open email: reply buttons, quick replies, snooze, a thread summary, and dates it mentions as calendar ideas. */
export function ReaderTools({ m, showDates }: { m: MailMessage; showDates: boolean }) {
  const s = useStore();
  const mail = s.settings.mail;
  const keys = {
    claude: s.settings.assistant.apiKey,
    gemini: s.settings.assistant.geminiKey,
    geminiModel: s.settings.assistant.geminiModel,
  };
  const [sum, setSum] = useState<{ summary: string; deadlines: string[]; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ideas = useMemo(() => dateIdeas(m.text || m.preview || m.subject), [m.id, m.text, m.preview, m.subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const who: AiProvider | null = keys.claude ? "claude" : keys.gemini ? "gemini" : null;

  const summarise = async () => {
    if (!who) return setErr("Add an Anthropic or Gemini key in Settings → Assistant to summarise threads.");
    if (!mail.aiConfirmed[who]) {
      if (
        !window.confirm(
          `To summarise, the text of this thread (quoted replies removed, card and long numbers hidden) is sent to ${who === "claude" ? "Anthropic (Claude)" : "Google (Gemini)"}. Continue?`,
        )
      )
        return;
      s.updateSettings((st) => void (st.mail.aiConfirmed[who] = true));
    }
    setBusy(true);
    setErr("");
    try {
      const thread = (await allMessages()).filter((x) => x.accountId === m.accountId && x.threadId === m.threadId);
      const ctx = buildThreadContext(thread.length ? thread : [m], mail.accounts.find((a) => a.id === m.accountId)?.address ?? "", {
        keep: 8,
      });
      setSum({ ...parseSummary(await ask(who, summaryPrompt(ctx.text), keys)), count: ctx.count });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack" aria-label="Reply and tools" style={{ gap: 10 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn sm primary" onClick={() => replyTo("reply", m)}>
          Reply
        </button>
        <button className="btn sm" onClick={() => replyTo("replyAll", m)}>
          Reply all
        </button>
        <button className="btn sm" onClick={() => replyTo("forward", m)}>
          Forward
        </button>
        <button className="btn sm" onClick={() => replyTo("reply", m, { ai: "claude" })}>
          Draft with Claude
        </button>
        <button className="btn sm" onClick={() => replyTo("reply", m, { ai: "gemini" })}>
          Draft with Gemini
        </button>
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label="Snooze"
          value=""
          onChange={(e) => {
            const at = Number(e.target.value);
            if (at) void snoozeMail(m.id, at).then(() => toast(`Snoozed until ${format(at, "EEE d MMM, h:mm a")}.`));
          }}
        >
          <option value="">Snooze…</option>
          {snoozeOptions().map((o) => (
            <option key={o.at} value={o.at}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }} role="group" aria-label="Quick replies">
        {QUICK.map((q) => (
          <button key={q} className="chip" onClick={() => replyTo("reply", m, { text: q })}>
            {q}
          </button>
        ))}
      </div>

      <div>
        <button className="btn sm" disabled={busy} onClick={() => void summarise()}>
          {busy ? "Summarising…" : "Summarise thread"}
        </button>
        {err && (
          <div className="alert bad" role="alert" style={{ marginTop: 6 }}>
            {err}
          </div>
        )}
        {sum && (
          <div className="card stack" style={{ gap: 6, marginTop: 8 }}>
            <div className="eyebrow">
              Summary · {sum.count} message{sum.count === 1 ? "" : "s"}
            </div>
            <div>{sum.summary || "Nothing to summarise."}</div>
            {sum.deadlines.length > 0 && (
              <>
                <div className="eyebrow">Deadlines</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {sum.deadlines.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="faint" style={{ fontSize: 12 }}>
              Made by {who === "claude" ? "Claude" : "Gemini"} from the thread with personal details removed.
            </div>
          </div>
        )}
      </div>

      {showDates && ideas.length > 0 && <DateCards ideas={ideas} from={m.from.name || m.from.address} />}
    </section>
  );
}

function DateCards({ ideas, from }: { ideas: DateIdea[]; from: string }) {
  const s = useStore();
  return (
    <div className="stack" style={{ gap: 8 }} aria-label="Dates in this email">
      <div className="eyebrow">Dates in this email</div>
      {ideas.map((i) => {
        const clash = i.allDay ? [] : conflictsFor(i.start, i.end);
        return (
          <div key={i.start.toISOString()} className="card stack" style={{ gap: 4, padding: 10 }}>
            <b>{i.title}</b>
            <div className="muted">
              {i.allDay ? format(i.start, "EEE d MMM") : `${format(i.start, "EEE d MMM · h:mm a")} – ${format(i.end, "h:mm a")}`}
            </div>
            {clash.length > 0 && (
              <div style={{ color: "var(--warn)", fontSize: 13 }}>
                Clashes with “{clash[0].event.title}” at {format(clash[0].start, "h:mm a")}
              </div>
            )}
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button
                className="btn sm primary"
                onClick={() => {
                  s.upsert("events", {
                    title: i.title.slice(0, 80),
                    start: localIso(i.start),
                    end: localIso(i.end),
                    allDay: i.allDay,
                    source: "email",
                    notes: `From ${from}`,
                    reminderMins: [s.settings.reminders.defaultEventMins],
                  });
                  toast("Added to calendar.");
                }}
              >
                Add to calendar
              </button>
              <button
                className="btn sm"
                onClick={() => {
                  s.upsert("tasks", {
                    title: i.title.slice(0, 120),
                    due: ymd(i.start),
                    done: false,
                    priority: "med",
                    notes: `From ${from}`,
                  });
                  toast("Added as a task.");
                }}
              >
                Add as task
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
