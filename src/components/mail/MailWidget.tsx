import { formatDistanceToNowStrict } from "date-fns";
import { useStore } from "../../store";
import { BUCKET_LABEL } from "../../lib/mail/classify";
import { dismissMail, needsAttention, useMail } from "../../lib/mail/engine";
import { IX } from "../Icons";

/** Home card: important unread mail. Junk and subscriptions never appear here. */
export function MailWidget() {
  const s = useStore();
  const { messages, error } = useMail();
  const accounts = s.settings.mail.accounts;
  const list = needsAttention(messages);
  const open = (id?: string) => {
    useMail.setState({ selectedId: id, tab: "mail" });
    s.setPage("email");
  };
  return (
    <>
      <h2>Important mail</h2>
      {!accounts.length ? (
        <div className="empty">
          Connect Outlook to see the emails that need you here.
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
                className="btn sm ghost icon"
                aria-label={`Dismiss ${m.subject}`}
                title="Dismiss (this device only)"
                onClick={() => dismissMail(m.id)}
              >
                <IX size={14} />
              </button>
            </div>
          ))}
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
