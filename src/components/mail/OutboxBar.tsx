import { useEffect, useState } from "react";
import { useOutbox, discardOutbox, refreshOutbox, retrySend, undoSend } from "../../lib/mail/outbox";
import { closeCompose, openCompose, useCompose } from "../../lib/mail/composeStore";
import { Compose } from "./Compose";

/** Undo after Send, failed messages, and the compose window itself. Mounted once for the whole app. */
export function MailHost() {
  const items = useOutbox((s) => s.items);
  const compose = useCompose();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    refreshOutbox().catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const waiting = items.filter((i) => i.status === "queued" && i.sendAt - now <= 60_000 && i.sendAt > now - 1000);
  const failed = items.filter((i) => i.status === "failed");
  return (
    <>
      {compose.draft && <Compose key={compose.draft.id} draft={compose.draft} onClose={closeCompose} autoDraft={compose.autoDraft} />}
      {(waiting.length > 0 || failed.length > 0) && (
        <div className="outbox-bar" role="status" aria-live="polite">
          {waiting.map((i) => (
            <div key={i.id} className="outbox-item">
              <span>
                Sending “{i.draft.subject || "(no subject)"}” in {Math.max(0, Math.ceil((i.sendAt - now) / 1000))}s
              </span>
              <button
                className="btn sm"
                onClick={() =>
                  undoSend(i.id).then((d) => {
                    if (d) openCompose(d);
                  })
                }
              >
                Undo
              </button>
            </div>
          ))}
          {failed.map((i) => (
            <div key={i.id} className="outbox-item bad">
              <span>
                Couldn't send “{i.draft.subject || "(no subject)"}”: {i.error}
              </span>
              <button className="btn sm" onClick={() => void retrySend(i.id)}>
                Retry
              </button>
              <button className="btn sm ghost" onClick={() => void discardOutbox(i.id)}>
                Discard
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
