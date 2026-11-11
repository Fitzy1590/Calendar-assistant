import { formatDistanceToNowStrict } from "date-fns";
import { useStore } from "../../store";
import { BUCKET_LABEL } from "../../lib/mail/classify";
import { dismissMail, needsAttention, useMail } from "../../lib/mail/engine";
import { IX } from "../Icons";
import { useState } from "react";
import { toast } from "../../store";
import { addSenderRule, reclassifyCached, setOverride } from "../../lib/mail/engine";
import { importanceSource, SOURCE_LABEL, stopImportant } from "../../lib/mail/quick";

/** Home card: important unread mail. Junk and subscriptions never appear here. */
export function MailWidget() {
  const s = useStore();
  const { messages, error } = useMail();
  const accounts = s.settings.mail.accounts;
  const list = needsAttention(messages);
  const [more, setMore] = useState<string | null>(null);
  const open = (id?: string) => {
    useMail.setState({ selectedId: id, tab: "mail" });
    s.setPage("email");
  };
  return (
    <>
      <h2>Important mail</h2>
      {!accounts.length ? (
        <div className="empty">
          Connect an email account to see the emails that need you here.
          <div style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => s.setPage("settings")}>
              Set up email
            </button>
          </div>
        </div>
      ) : (
        <div className="list">
          {list.slice(0, 5).map((m) => (
            <div key={m.id} className="mail-home-item">
              <button className="mail-home-row" onClick={() => open(m.id)} aria-label={`${m.from.name || m.from.address}: ${m.subject}`}>
                <b className="ellipsis">{m.from.name || m.from.address}</b>
                <span className="muted ellipsis">{m.subject}</span>
                <span className="faint mono" style={{ fontSize: 11 }}>
                  {BUCKET_LABEL[m.bucket]} · {formatDistanceToNowStrict(m.receivedAt)} ago
                </span>
              </button>
              <button
                className="btn sm ghost"
                aria-expanded={more === m.id}
                aria-label={`Not important options for ${m.subject}`}
                onClick={() => setMore(more === m.id ? null : m.id)}
              >
                ⋯
              </button>
              <button
                className="btn sm ghost icon"
                aria-label={`Dismiss ${m.subject}`}
                title="Dismiss (this device only)"
                onClick={() => dismissMail(m.id)}
              >
                <IX size={14} />
              </button>
            </div>
          ))}
          {list.slice(0, 5).map((m) => {
            if (more !== m.id) return null;
            const src = importanceSource(m);
            return (
              <div
                key={"q" + m.id}
                className="row card"
                role="group"
                aria-label="Not important options"
                style={{ flexWrap: "wrap", padding: 8, gap: 6 }}
              >
                <button
                  className="btn sm"
                  onClick={() => void setOverride(m.id, { important: false }).then(() => (setMore(null), toast("Marked not important.")))}
                >
                  Not important
                </button>
                <button
                  className="btn sm"
                  onClick={() =>
                    void addSenderRule(m, "mute").then(() => (setMore(null), toast(`Muted ${m.from.name || m.from.address}.`)))
                  }
                >
                  Mute {m.from.name || m.from.address}
                </button>
                {src && (
                  <button
                    className="btn sm"
                    onClick={() => {
                      s.updateSettings((st) => void (st.mail.important = stopImportant(st.mail.important, src)));
                      void reclassifyCached().then(() => (setMore(null), toast(`No longer treating ${SOURCE_LABEL[src]} as important.`)));
                    }}
                  >
                    Not important: {SOURCE_LABEL[src]}
                  </button>
                )}
              </div>
            );
          })}
          {!list.length && (
            <div className="empty">{error ? "Couldn't check your email. See Settings → Email." : "Nothing important right now."}</div>
          )}
          {list.length > 5 && <div className="faint">and {list.length - 5} more</div>}
          <button className="btn sm ghost" onClick={() => open()}>
            Open Email
          </button>
        </div>
      )}
    </>
  );
}
