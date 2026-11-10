import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNowStrict, isToday } from "date-fns";
import { useStore } from "../store";
import { PageHead } from "../components/ui";
import { Bills } from "../components/mail/Bills";
import { FolderRuleDialog } from "../components/mail/FolderRuleDialog";
import { HandlePanel } from "../components/mail/HandlePanel";
import { MailContextMenu } from "../components/mail/MailContextMenu";
import { BUCKET_LABEL } from "../lib/mail/classify";
import { dismissMail, needsAttention, refreshMail, syncMail, unpaidBills, useMail } from "../lib/mail/engine";
import { getMessage, putMessages } from "../lib/mail/cache";
import { providerFor } from "../lib/mail/providers";
import type { MailMessage } from "../lib/mail/types";
import { isAndroid } from "../lib/platform";

type View = string; // a built-in view id, or `folder:<id>`
const VIEWS: { id: View; label: string; match: (m: MailMessage) => boolean }[] = [
  { id: "important", label: "Important", match: (m) => m.important },
  { id: "inbox", label: "Inbox", match: (m) => m.bucket !== "spam" && m.bucket !== "subscriptions" },
  { id: "action", label: "Action required", match: (m) => m.bucket === "action" || m.bucket === "urgent" },
  { id: "financial", label: "Financial", match: (m) => m.bucket === "financial" },
  { id: "social", label: "Social", match: (m) => m.bucket === "social" },
  { id: "subscriptions", label: "Subscriptions", match: (m) => m.bucket === "subscriptions" },
  { id: "spam", label: "Junk", match: (m) => m.bucket === "spam" },
];

const when = (t: number) => (isToday(t) ? format(t, "h:mm a") : formatDistanceToNowStrict(t, { addSuffix: true }));

export function Email() {
  const s = useStore();
  const { messages, syncing, error, selectedId, tab } = useMail();
  const [view, setView] = useState<View>("important");
  const [ctx, setCtx] = useState<{ m: MailMessage; x: number; y: number } | null>(null);
  const [fileFor, setFileFor] = useState<MailMessage | null>(null);
  const [body, setBody] = useState<{ id: string; text: string; loading: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const accounts = s.settings.mail.accounts;

  useEffect(() => {
    refreshMail().catch(() => {});
  }, []);

  const folders = s.settings.mail.folders;
  const folderIds = folders.map((f) => f.id);
  // mail filed in a folder leaves the other views; a folder that was deleted no longer holds any
  const filed = (m: MailMessage) => !!m.folderId && folderIds.includes(m.folderId);
  const current = view.startsWith("folder:") ? folders.find((f) => f.id === view.slice(7)) : undefined;
  const viewLabel = current?.name ?? VIEWS.find((v) => v.id === view)?.label ?? "Mail";
  const rows = useMemo(
    () =>
      view.startsWith("folder:")
        ? messages.filter((m) => m.folderId === view.slice(7))
        : messages.filter((VIEWS.find((v) => v.id === view) ?? VIEWS[0]).match).filter((m) => !filed(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, view, folderIds.join(",")],
  );
  const counts = useMemo(
    () => ({
      ...Object.fromEntries(VIEWS.map((v) => [v.id, messages.filter((m) => v.match(m) && !m.isRead && !filed(m)).length])),
      ...Object.fromEntries(folders.map((f) => [`folder:${f.id}`, messages.filter((m) => m.folderId === f.id && !m.isRead).length])),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, folderIds.join(",")],
  );
  const selected = messages.find((m) => m.id === selectedId);

  // open a message: show it, mark it seen here (not in your mailbox), and load its text if it isn't cached
  useEffect(() => {
    if (!selected) return;
    if (!selected.dismissed) void dismissMail(selected.id);
    if (selected.text) return void setBody({ id: selected.id, text: selected.text, loading: false });
    setBody({ id: selected.id, text: "", loading: true });
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        const acct = s.settings.mail.accounts.find((a) => a.id === selected.accountId);
        if (!acct) throw new Error("account removed");
        return providerFor(acct).bodyText(selected.providerId);
      })
      .then(async (text) => {
        if (cancelled) return;
        setBody({ id: selected.id, text, loading: false });
        const m = await getMessage(selected.id);
        if (m && s.settings.mail.cacheText) await putMessages([{ ...m, text }], true);
      })
      .catch(() => !cancelled && setBody({ id: selected.id, text: selected.preview, loading: false }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const move = (delta: number) => {
    const i = rows.findIndex((m) => m.id === selectedId);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i < 0 ? 0 : i + delta))];
    if (next) {
      useMail.setState({ selectedId: next.id });
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)?.focus());
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "j") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp" || e.key === "k") (e.preventDefault(), move(-1));
    else if (e.key === "Home") (e.preventDefault(), useMail.setState({ selectedId: rows[0]?.id }));
    else if (e.key === "End") (e.preventDefault(), useMail.setState({ selectedId: rows[rows.length - 1]?.id }));
  };

  if (isAndroid())
    return (
      <>
        <PageHead title="Email" />
        <div className="card">
          <div className="empty">Email runs in the Windows app for now. Important mail alerts appear there.</div>
        </div>
      </>
    );
  if (!accounts.length)
    return (
      <>
        <PageHead title="Email" />
        <div className="card stack">
          <div>
            Connect your Outlook, Gmail or other email account to see your mail here, with junk and subscriptions kept out of the way.
          </div>
          <div>
            <button className="btn primary" onClick={() => s.setPage("settings")}>
              Set up email in Settings
            </button>
          </div>
        </div>
      </>
    );

  const billCount = unpaidBills(messages).length;
  const sync = (
    <button className="btn" disabled={syncing} onClick={() => syncMail().catch(() => {})}>
      {syncing ? "Syncing…" : "Sync now"}
    </button>
  );
  const tabs = (
    <div className="seg" role="group" aria-label="Email sections" style={{ marginBottom: 12 }}>
      <button aria-pressed={tab === "mail"} onClick={() => useMail.setState({ tab: "mail" })}>
        Mail
      </button>
      <button aria-pressed={tab === "bills"} onClick={() => useMail.setState({ tab: "bills" })}>
        Bills{billCount ? ` ${billCount}` : ""}
      </button>
    </div>
  );
  if (tab === "bills")
    return (
      <>
        <PageHead title="Email" sub={accounts.map((a) => a.address).join(", ")} actions={sync} />
        {tabs}
        <Bills />
      </>
    );
  return (
    <>
      <PageHead
        title="Email"
        sub={accounts.map((a) => a.address).join(", ")}
        actions={
          <button className="btn" disabled={syncing} onClick={() => syncMail().catch(() => {})}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        }
      />
      {tabs}
      {error && (
        <div role="alert" style={{ color: "var(--bad)", fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div className="mail">
        <nav className="mail-folders" aria-label="Mail folders">
          {VIEWS.filter((v) => v.id !== "spam" || messages.some((m) => m.bucket === "spam")).map((v) => (
            <button key={v.id} className="chip" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
              {counts[v.id] ? <span className="mono faint"> {counts[v.id]}</span> : null}
            </button>
          ))}
          {folders.map((f) => (
            <button key={f.id} className="chip" aria-pressed={view === `folder:${f.id}`} onClick={() => setView(`folder:${f.id}`)}>
              {f.name}
              {counts[`folder:${f.id}`] ? <span className="mono faint"> {counts[`folder:${f.id}`]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="mail-list card" role="listbox" aria-label={`${viewLabel} messages`} ref={listRef} onKeyDown={onKey}>
          {rows.map((m, i) => (
            <div
              key={m.id}
              data-id={m.id}
              role="option"
              aria-selected={m.id === selectedId}
              tabIndex={m.id === selectedId || (!selectedId && i === 0) ? 0 : -1}
              className={"mail-row" + (m.isRead || m.dismissed ? "" : " unread")}
              aria-label={`${m.from.name || m.from.address}, ${m.subject}, ${when(m.receivedAt)}${m.isRead ? "" : ", unread"}${m.important ? ", important" : ""}`}
              onClick={() => useMail.setState({ selectedId: m.id })}
              onKeyDown={(e) => e.key === "Enter" && useMail.setState({ selectedId: m.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                useMail.setState({ selectedId: m.id });
                setCtx({ m, x: e.clientX, y: e.clientY });
              }}
            >
              <span className="mail-from ellipsis">{m.from.name || m.from.address}</span>
              <span className="faint mono" style={{ fontSize: 11 }}>
                {when(m.receivedAt)}
              </span>
              <span className="mail-subject ellipsis">{m.subject}</span>
              <span className="muted ellipsis mail-preview">
                {view !== "important" && view !== "action" && m.bucket !== "inbox" ? (
                  <span className="tag">{BUCKET_LABEL[m.bucket]}</span>
                ) : null}{" "}
                {m.preview}
              </span>
            </div>
          ))}
          {!rows.length && (
            <div className="empty">
              {messages.length ? "Nothing here." : syncing ? "Fetching your mail…" : "No mail yet. Press Sync now."}
            </div>
          )}
        </div>
        <article className="mail-reader card" aria-live="polite">
          {selected ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>{selected.subject}</h2>
              <div className="muted" style={{ fontSize: 13 }}>
                From <b>{selected.from.name || selected.from.address}</b> &lt;{selected.from.address}&gt; ·{" "}
                {format(selected.receivedAt, "EEE d MMM, h:mm a")}
                {selected.to.length ? <div>To {selected.to.map((a) => a.name || a.address).join(", ")}</div> : null}
              </div>
              <div className="faint" style={{ fontSize: 12.5 }}>
                {selected.important ? "Important" : BUCKET_LABEL[selected.bucket]}: {selected.reasons.join(". ")}
              </div>
              <pre className="mail-body">
                {body?.id === selected.id ? (body.loading ? "Loading…" : body.text || selected.preview) : selected.preview}
              </pre>
              <HandlePanel m={selected} onFile={() => setFileFor(selected)} />
              <div className="faint" style={{ fontSize: 12 }}>
                Opening a message here only marks it as seen in this app. Your mailbox is not changed.
              </div>
            </div>
          ) : (
            <div className="empty">Select a message to read it.</div>
          )}
        </article>
      </div>
      {ctx && (
        <MailContextMenu
          {...ctx}
          onClose={() => setCtx(null)}
          onFile={() => setFileFor(ctx.m)}
          onMoved={(id) => id && setView(`folder:${id}`)}
        />
      )}
      {fileFor && <FolderRuleDialog m={fileFor} onClose={() => setFileFor(null)} onDone={(id) => setView(`folder:${id}`)} />}
      <span className="visually-hidden" aria-live="polite">
        {needsAttention(messages).length} important unread
      </span>
    </>
  );
}
