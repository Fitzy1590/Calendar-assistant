import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNowStrict, isToday } from "date-fns";
import { toast, useStore } from "../store";
import { PageHead } from "../components/ui";
import { Bills } from "../components/mail/Bills";
import { FolderRuleDialog } from "../components/mail/FolderRuleDialog";
import { HandlePanel } from "../components/mail/HandlePanel";
import { ReaderTools } from "../components/mail/ReaderTools";
import { isSnoozed } from "../lib/mail/followups";
import { groupRows, initials, searchMail, tone } from "../lib/mail/mailUi";
import { Seg } from "../components/ui";
import { newMail } from "../lib/mail/composeStore";
import { MailContextMenu } from "../components/mail/MailContextMenu";
import { BUCKET_LABEL } from "../lib/mail/classify";
import {
  dismissMail,
  isSeen,
  moveManyToFolder,
  needsAttention,
  refreshMail,
  setReadMany,
  syncMail,
  unpaidBills,
  useMail,
} from "../lib/mail/engine";
import { getMessage, putMessages } from "../lib/mail/cache";
import { providerFor } from "../lib/mail/providers";
import type { MailMessage } from "../lib/mail/types";

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
  const [datesFor, setDatesFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [readTab, setReadTab] = useState<"all" | "unread" | "read">("all");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
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
  const viewLabel = current?.name ?? (view === "snoozed" ? "Snoozed" : (VIEWS.find((v) => v.id === view)?.label ?? "Mail"));
  const rows = useMemo(
    () =>
      view.startsWith("folder:")
        ? messages.filter((m) => m.folderId === view.slice(7))
        : view === "snoozed"
          ? messages.filter((m) => isSnoozed(m))
          : messages.filter((VIEWS.find((v) => v.id === view) ?? VIEWS[0]).match).filter((m) => !filed(m) && !isSnoozed(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, view, folderIds.join(",")],
  );
  const byRead = useMemo(
    () => searchMail(rows, query).filter((m) => readTab === "all" || (readTab === "read") === isSeen(m)),
    [rows, query, readTab],
  );
  const groups = useMemo(() => groupRows(byRead), [byRead]);
  const shown = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const unreadHere = useMemo(() => searchMail(rows, query).filter((m) => !isSeen(m)).length, [rows, query]);
  const readHere = rows.length - rows.filter((m) => !isSeen(m)).length;
  const run = (p: Promise<unknown>) => p.catch((e: Error) => toast(e.message));
  const markShown = (read: boolean) =>
    run(
      setReadMany(
        shown.map((m) => m.id),
        read,
      ).then((n) => toast(n ? `Marked ${n} as ${read ? "read" : "unread"}.` : "Nothing to change.")),
    );
  const pickedIds = shown.filter((m) => picked.has(m.id)).map((m) => m.id);
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const stopSelecting = () => (setSelecting(false), setPicked(new Set()));
  const bulk = (fn: () => Promise<unknown>, msg: string) => run(fn().then(() => (toast(msg), stopSelecting())));
  const counts = useMemo<Record<string, number>>(
    () => ({
      ...Object.fromEntries(VIEWS.map((v) => [v.id, messages.filter((m) => v.match(m) && !m.isRead && !filed(m) && !isSnoozed(m)).length])),
      snoozed: messages.filter((m) => isSnoozed(m)).length,
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
    const i = shown.findIndex((m) => m.id === selectedId);
    const next = shown[Math.max(0, Math.min(shown.length - 1, i < 0 ? 0 : i + delta))];
    if (next) {
      useMail.setState({ selectedId: next.id });
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)?.focus());
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "j") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp" || e.key === "k") (e.preventDefault(), move(-1));
    else if (e.key === "Home") (e.preventDefault(), useMail.setState({ selectedId: shown[0]?.id }));
    else if (e.key === "End") (e.preventDefault(), useMail.setState({ selectedId: shown[shown.length - 1]?.id }));
  };

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
          <span className="row">
            <button className="btn primary" onClick={() => newMail()}>
              New email
            </button>
            <button className="btn" disabled={syncing} onClick={() => syncMail().catch(() => {})}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </span>
        }
      />
      {tabs}
      {error && (
        <div role="alert" style={{ color: "var(--bad)", fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
        <input
          className="input"
          type="search"
          style={{ maxWidth: 360 }}
          placeholder="Search mail"
          aria-label="Search mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Seg
          value={s.settings.mail.layout}
          options={[
            { value: "tabs", label: "Tabs on top" },
            { value: "classic", label: "Classic" },
          ]}
          onChange={(v) => s.updateSettings((st) => void (st.mail.layout = v))}
        />
      </div>
      <div className="row" style={{ marginBottom: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div className="seg" role="group" aria-label="Read state">
          <button aria-pressed={readTab === "all"} onClick={() => setReadTab("all")}>
            All
          </button>
          <button aria-pressed={readTab === "unread"} onClick={() => setReadTab("unread")}>
            Unread{unreadHere ? ` ${unreadHere}` : ""}
          </button>
          <button aria-pressed={readTab === "read"} onClick={() => setReadTab("read")}>
            Read{readHere ? ` ${readHere}` : ""}
          </button>
        </div>
        <span className="row" style={{ flexWrap: "wrap" }}>
          {readTab === "read" ? (
            <button className="btn" disabled={!shown.length} onClick={() => markShown(false)}>
              Mark all as unread
            </button>
          ) : (
            <button className="btn" disabled={!shown.some((m) => !isSeen(m))} onClick={() => markShown(true)}>
              Mark all as read
            </button>
          )}
          <button className="btn" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? "Cancel select" : "Select"}
          </button>
        </span>
      </div>
      {selecting && (
        <div className="row" role="toolbar" aria-label="Bulk actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setPicked(new Set(pickedIds.length === shown.length ? [] : shown.map((m) => m.id)))}>
            {pickedIds.length === shown.length && shown.length ? "Select none" : "Select all"}
          </button>
          <span className="muted" role="status" style={{ fontSize: 13 }}>
            {pickedIds.length} selected
          </span>
          <button
            className="btn"
            disabled={!pickedIds.length}
            onClick={() => bulk(() => setReadMany(pickedIds, true), `Marked ${pickedIds.length} as read.`)}
          >
            Mark as read
          </button>
          <button
            className="btn"
            disabled={!pickedIds.length}
            onClick={() => bulk(() => setReadMany(pickedIds, false), `Marked ${pickedIds.length} as unread.`)}
          >
            Mark as unread
          </button>
          <select
            className="input"
            style={{ maxWidth: 200 }}
            aria-label="Move selected to folder"
            disabled={!pickedIds.length}
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const id = v === "__inbox" ? null : v;
              void bulk(() => moveManyToFolder(pickedIds, id), `Moved ${pickedIds.length}. Only in this app.`);
            }}
          >
            <option value="">Move to…</option>
            <option value="__inbox">Back to Inbox</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={"mail " + s.settings.mail.layout}>
        <nav className="mail-folders" aria-label="Mail folders">
          {VIEWS.filter((v) => v.id !== "spam" || messages.some((m) => m.bucket === "spam")).map((v) => (
            <button key={v.id} className="chip" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
              {counts[v.id] ? <span className="mono faint"> {counts[v.id]}</span> : null}
            </button>
          ))}
          {counts.snoozed > 0 && (
            <button className="chip" aria-pressed={view === "snoozed"} onClick={() => setView("snoozed")}>
              Snoozed <span className="mono faint">{counts.snoozed}</span>
            </button>
          )}
          {folders.map((f) => (
            <button key={f.id} className="chip" aria-pressed={view === `folder:${f.id}`} onClick={() => setView(`folder:${f.id}`)}>
              {f.name}
              {counts[`folder:${f.id}`] ? <span className="mono faint"> {counts[`folder:${f.id}`]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="mail-list card" role="listbox" aria-label={`${viewLabel} messages`} ref={listRef} onKeyDown={onKey}>
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="mail-day eyebrow" aria-hidden="true">
                {g.label}
              </div>
              {g.rows.map((m) => (
                <div
                  key={m.id}
                  data-id={m.id}
                  role="option"
                  aria-selected={selecting ? picked.has(m.id) : m.id === selectedId}
                  tabIndex={m.id === selectedId || (!selectedId && m.id === shown[0]?.id) ? 0 : -1}
                  className={"mail-row" + (isSeen(m) ? "" : " unread")}
                  aria-label={`${m.from.name || m.from.address}, ${m.subject}, ${when(m.receivedAt)}${isSeen(m) ? "" : ", unread"}${selecting && picked.has(m.id) ? ", selected" : ""}${m.important ? ", important" : ""}`}
                  onClick={() => (selecting ? toggle(m.id) : useMail.setState({ selectedId: m.id }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || (selecting && e.key === " ")) {
                      e.preventDefault();
                      if (selecting) toggle(m.id);
                      else useMail.setState({ selectedId: m.id });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    useMail.setState({ selectedId: m.id });
                    setCtx({ m, x: e.clientX, y: e.clientY });
                  }}
                >
                  {selecting ? (
                    <input
                      type="checkbox"
                      tabIndex={-1}
                      aria-hidden="true"
                      checked={picked.has(m.id)}
                      readOnly
                      style={{ width: 20, height: 20 }}
                    />
                  ) : (
                    <span className={"avatar tone" + tone(m.from.address)} aria-hidden="true">
                      {initials(m.from.name, m.from.address)}
                    </span>
                  )}
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
            </div>
          ))}
          {!shown.length && (
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
              <ReaderTools
                m={selected}
                showDates={datesFor === selected.id || (selected.bucket !== "subscriptions" && selected.bucket !== "spam")}
              />
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
          onDates={() => setDatesFor(ctx.m.id)}
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
