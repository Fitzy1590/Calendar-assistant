import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../../store";
import { createFolder, deleteFolder, reclassifyCached, renameFolder, syncMail } from "../../lib/mail/engine";
import { dropMenu, MENU_ITEMS, menuOrder, nudgeMenu, toggleMenuItem } from "../../lib/mail/menu";
import { allowSending } from "../../lib/mail/accounts";
import { connectGmail, connectImap, disconnectAccount, otherMailAvailable } from "../../lib/mail/accounts";
import { domainOf, guessImap } from "../../lib/mail/imapPresets";
import { explainImapError } from "../../lib/mail/imapHelp";
import { connectOutlook, msConfigured, msSignInAvailable } from "../../lib/mail/microsoft";
import { googleConfigured } from "../../lib/google";
import { toast } from "../../store";
import { SetupGuideButton } from "../SetupGuide";
import { Field, Suggest, Toggle } from "../ui";
import { KEY_LINKS } from "../../lib/suggest";
import { openUrl } from "../../lib/platform";
import { RulesEditor } from "./RulesEditor";

/** Settings: connect Outlook, Gmail or any IMAP mailbox, choose what counts as important, and how it alerts. */
export function EmailSetup() {
  const s = useStore();
  const m = s.settings.mail;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(""); // stays on screen until the next try, so a failed sign-in can be read and copied
  const [errorFrom, setErrorFrom] = useState("");
  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setError("");
    setErrorFrom(label);
    try {
      const msg = await fn();
      if (msg) toast(msg);
    } catch (e) {
      const text = typeof e === "string" ? e : ((e as Error).message ?? String(e));
      setError(text);
      toast(text);
    } finally {
      setBusy("");
    }
  };
  const set = (fn: (mail: typeof m) => void, resort = false) => {
    s.updateSettings((st) => fn(st.mail));
    if (resort) reclassifyCached().catch(() => {});
  };
  const connect = () =>
    run("connect", async () => {
      await connectOutlook();
      return syncMail();
    });
  const canConnect = msSignInAvailable() && msConfigured();
  const [imap, setImap] = useState<{ open: boolean; address: string; password: string; host: string; port: number; edited: boolean }>({
    open: false,
    address: "",
    password: "",
    host: "",
    port: 993,
    edited: false,
  });
  const preset = guessImap(imap.address);
  const host = imap.edited ? imap.host : preset.host;
  const port = imap.edited ? imap.port : preset.port;
  const addImap = () =>
    run("imap", async () => {
      await connectImap(imap.address, { host, port, user: imap.address, password: imap.password });
      setImap({ open: false, address: "", password: "", host: "", port: 993, edited: false });
      return syncMail();
    });
  const addGmail = () =>
    run("gmail", async () => {
      await connectGmail();
      return syncMail();
    });
  return (
    <div className="stack">
      <div className="stack" style={{ gap: 8 }}>
        {m.accounts.map((a) => (
          <div key={a.id} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span className="row">
              <span className={"dot " + (a.status === "ok" ? "ok" : "")} />
              <b>{a.address}</b>
              <span className="faint" style={{ fontSize: 12.5 }}>
                {a.status === "needs-reconnect"
                  ? "Sign in again"
                  : a.status === "error"
                    ? a.error
                    : a.lastSyncAt
                      ? `synced ${format(a.lastSyncAt, "d MMM h:mm a")}`
                      : "not synced yet"}
              </span>
            </span>
            <span className="row">
              {a.status === "needs-reconnect" && a.provider === "graph" && (
                <button className="btn sm primary" disabled={!canConnect || !!busy} onClick={connect}>
                  Sign in again
                </button>
              )}
              {a.status === "needs-reconnect" && a.provider === "gmail" && (
                <button className="btn sm primary" disabled={!!busy} onClick={addGmail}>
                  Sign in again
                </button>
              )}
              {a.status === "needs-reconnect" && a.provider === "imap" && (
                <button
                  className="btn sm primary"
                  disabled={!!busy}
                  onClick={() =>
                    setImap({
                      open: true,
                      address: a.address,
                      password: "",
                      host: a.imap?.host ?? "",
                      port: a.imap?.port ?? 993,
                      edited: !!a.imap,
                    })
                  }
                >
                  Enter password again
                </button>
              )}
              <button className="btn sm" disabled={!!busy} onClick={() => run("sync", syncMail)}>
                {busy === "sync" ? "Syncing…" : "Sync now"}
              </button>
              <button
                className="btn sm ghost"
                disabled={!!busy}
                onClick={() =>
                  run("rm", async () => (await disconnectAccount(a), "Account removed, and its mail cleared from this device."))
                }
              >
                Disconnect
              </button>
            </span>
          </div>
        ))}
        {!m.accounts.length && <div className="muted">No email account connected yet.</div>}
      </div>
      {error && errorFrom !== "imap" && (
        <div className="alert bad" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button className="btn primary" disabled={!canConnect || !!busy} onClick={connect}>
          {busy === "connect" ? "Waiting for your browser…" : "Add Outlook / Hotmail account"}
        </button>
        {!msSignInAvailable() && <span className="faint">Sign-in runs in the installed Windows app.</span>}
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn" disabled={!otherMailAvailable() || !googleConfigured() || !!busy} onClick={addGmail}>
          {busy === "gmail" ? "Waiting for your browser…" : "Add Gmail account"}
        </button>
        <button className="btn" disabled={!otherMailAvailable() || !!busy} onClick={() => setImap((x) => ({ ...x, open: !x.open }))}>
          Add other email (Bigpond, Yahoo, iCloud…)
        </button>
        {!googleConfigured() && (
          <span className="faint" style={{ fontSize: 12.5 }}>
            Gmail uses the Google client ID from the Google setup above.
          </span>
        )}
      </div>
      {imap.open && (
        <div className="stack" style={{ gap: 10, padding: 12, border: "1px solid var(--line-strong)", borderRadius: "var(--radius)" }}>
          <Field label="Email address">
            <input
              className="input"
              type="email"
              autoComplete="off"
              value={imap.address}
              onChange={(e) => setImap({ ...imap, address: e.target.value })}
              placeholder="you@bigpond.com"
            />
          </Field>
          <Field label="Password">
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={imap.password}
              onChange={(e) => setImap({ ...imap, password: e.target.value })}
            />
          </Field>
          {imap.address.includes("@") && (
            <div className="faint" style={{ fontSize: 12.5 }}>
              {preset.useInstead ? (
                <b>{preset.note}</b>
              ) : (
                <>
                  Detected <b>{preset.name}</b> ({host || domainOf(imap.address)}). {preset.note}
                </>
              )}
            </div>
          )}
          <details>
            <summary className="faint">Server settings</summary>
            <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
              <input
                className="input mono"
                aria-label="IMAP server"
                value={host}
                onChange={(e) => setImap({ ...imap, host: e.target.value.trim(), port, edited: true })}
              />
              <input
                className="input mono"
                aria-label="Port"
                style={{ width: 90 }}
                inputMode="numeric"
                value={port}
                onChange={(e) => setImap({ ...imap, host, port: Number(e.target.value) || 993, edited: true })}
              />
            </div>
          </details>
          {error && errorFrom === "imap" && <ImapGuide error={error} address={imap.address} />}
          <div className="row">
            <button className="btn primary" disabled={!!busy || !imap.address || !imap.password || !!preset.useInstead} onClick={addImap}>
              {busy === "imap" ? "Checking the password…" : "Connect"}
            </button>
            <button className="btn ghost" disabled={!!busy} onClick={() => setImap((x) => ({ ...x, open: false }))}>
              Cancel
            </button>
          </div>
          <div className="faint" style={{ fontSize: 12.5 }}>
            Read-only. Your password is kept in Windows' secure storage on this PC, never in settings, backups or sync.
          </div>
        </div>
      )}
      <Field label="Microsoft app (client) ID">
        <input
          className="input mono"
          value={s.settings.email.microsoftClientId}
          onChange={(e) => s.updateSettings((st) => void (st.email.microsoftClientId = e.target.value.trim()))}
          placeholder="00000000-0000-…"
        />
        <Suggest label="Where to get it" items={[{ label: KEY_LINKS.entra.label, onUse: () => void openUrl(KEY_LINKS.entra.url) }]} />
      </Field>
      <div className="faint" style={{ fontSize: 12.5 }}>
        You create this once for free in Microsoft Entra (Azure). The guide walks you through it. The app only asks to <b>read</b> your
        mail.
      </div>
      <div>
        <SetupGuideButton kind="microsoft" label="Step-by-step Outlook setup guide" />
      </div>

      <FoldersEditor />
      <MenuEditor />
      <WritingEditor />

      <h4 style={{ margin: "8px 0 0" }}>What counts as important</h4>
      <span className="row">
        <Toggle
          checked={m.important.actionUrgent}
          onChange={(v) => set((x) => void (x.important.actionUrgent = v), true)}
          label="Action required and urgent"
        />{" "}
        Emails that ask you something or are time-sensitive
      </span>
      <span className="row">
        <Toggle
          checked={m.important.contacts}
          onChange={(v) => set((x) => void (x.important.contacts = v), true)}
          label="People in my Contacts"
        />{" "}
        Anyone saved in your Contacts
      </span>
      <span className="row">
        <Toggle
          checked={m.important.financial}
          onChange={(v) => set((x) => void (x.important.financial = v), true)}
          label="Financial alerts"
        />{" "}
        Bills due, failed payments and bank notices
      </span>
      <span className="row">
        <Toggle checked={m.important.everything} onChange={(v) => set((x) => void (x.important.everything = v), true)} label="Everything" />{" "}
        All personal mail
      </span>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Junk and subscriptions are never important: they stay in their own folders and never trigger a card or alert. Nothing is deleted.
      </div>

      <h4 style={{ margin: "8px 0 0" }}>How it shows up</h4>
      <span className="row">
        <Toggle checked={m.alerts.homeCard} onChange={(v) => set((x) => void (x.alerts.homeCard = v))} label="Home page card" /> “Important
        mail” card on Home
      </span>
      <span className="row">
        <Toggle checked={m.alerts.desktop} onChange={(v) => set((x) => void (x.alerts.desktop = v))} label="Desktop notifications" /> A
        notification when new important mail arrives
      </span>
      <span className="row">
        <Toggle checked={m.alerts.sound} onChange={(v) => set((x) => void (x.alerts.sound = v))} label="Alert sound" /> Play the Windows
        notification sound (off by default: alerts are silent)
      </span>
      <span className="row">
        <Toggle checked={m.alerts.badge} onChange={(v) => set((x) => void (x.alerts.badge = v))} label="Menu badge" /> Unread count next to
        Email in the left menu
      </span>
      <span className="row">
        <Toggle checked={m.alerts.dailySummary} onChange={(v) => set((x) => void (x.alerts.dailySummary = v))} label="Daily summary" /> One
        summary each morning after
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label="Summary hour"
          value={m.alerts.summaryHour}
          onChange={(e) => set((x) => void (x.alerts.summaryHour = Number(e.target.value)))}
        >
          {[6, 7, 8, 9, 10, 12].map((h) => (
            <option key={h} value={h}>{`${h}:00`}</option>
          ))}
        </select>
      </span>

      <h4 style={{ margin: "8px 0 0" }}>Your rules</h4>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Always treat a sender or subject words as important, always notify, mute, or send to Bills. Your rules win over the automatic
        sorting.
      </div>
      <RulesEditor />

      <h4 style={{ margin: "8px 0 0" }}>Bills</h4>
      <span className="row">
        Remind me
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label="Bill reminder"
          value={m.bills.remindDays}
          onChange={(e) => set((x) => void (x.bills.remindDays = Number(e.target.value)))}
        >
          <option value={0}>never</option>
          {[1, 2, 3, 7].map((n) => (
            <option key={n} value={n}>{`${n} day${n > 1 ? "s" : ""} before`}</option>
          ))}
        </select>
        an unpaid bill is due (and once if it's overdue)
      </span>

      <h4 style={{ margin: "8px 0 0" }}>Checking and storage</h4>
      <span className="row">
        Check for new mail every
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label="How often to check for mail"
          value={m.pollMins}
          onChange={(e) => set((x) => void (x.pollMins = Number(e.target.value)))}
        >
          {[1, 3, 5, 15].map((n) => (
            <option key={n} value={n}>{`${n} minute${n > 1 ? "s" : ""}`}</option>
          ))}
        </select>
        and when the app opens
      </span>
      <span className="row">
        <Toggle checked={m.cacheText} onChange={(v) => set((x) => void (x.cacheText = v))} label="Keep message text on this device" /> Keep
        message text for offline reading (off: only sender, subject and a short preview)
      </span>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Mail stays on this PC. It isn't synced to your phone or included in backups, and your sign-in is kept in Windows' secure store.
      </div>
    </div>
  );
}

/** What went wrong with an "Add other email" attempt, and what to do about it. */
function ImapGuide({ error, address }: { error: string; address: string }) {
  const fix = explainImapError(error, address);
  return (
    <div className="alert bad stack" role="alert" style={{ gap: 8 }}>
      <b>{fix.title}</b>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {fix.steps.map((st) => (
          <li key={st}>{st}</li>
        ))}
      </ol>
      {fix.links.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {fix.links.map((l) => (
            <button key={l.url} type="button" className="btn sm" onClick={() => void openUrl(l.url)}>
              {l.label}
            </button>
          ))}
        </div>
      )}
      <details>
        <summary className="faint">Technical detail</summary>
        <div className="mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
          {error}
        </div>
      </details>
    </div>
  );
}

/** The folders you made from the Email page. They live in this app only. */
function FoldersEditor() {
  const folders = useStore((s) => s.settings.mail.folders);
  const [name, setName] = useState("");
  if (!folders.length && !name)
    return (
      <div className="faint" style={{ fontSize: 12.5 }}>
        Tip: right-click an email in Email → “Create rule + new folder…” to sort mail into folders automatically. Folders live in this app
        only.
      </div>
    );
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h4 style={{ margin: "8px 0 0" }}>Folders (in this app only)</h4>
      {folders.map((f) => (
        <div key={f.id} className="row" style={{ flexWrap: "nowrap" }}>
          <input
            className="input"
            aria-label={`Folder name: ${f.name}`}
            defaultValue={f.name}
            maxLength={40}
            onBlur={(e) => void renameFolder(f.id, e.target.value || f.name)}
          />
          <button
            className="btn sm ghost"
            onClick={() => void deleteFolder(f.id).then(() => toast(`Deleted “${f.name}”. Its mail is back in the Inbox views.`))}
          >
            Delete
          </button>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            createFolder(name);
            setName("");
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      >
        <input className="input" value={name} maxLength={40} placeholder="New folder name" onChange={(e) => setName(e.target.value)} />
        <button className="btn sm">Add folder</button>
      </form>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Deleting a folder doesn't delete any mail: it goes back to the Inbox views. Your real mailbox is never changed.
      </div>
    </div>
  );
}

/** Settings: the right-click menu on an email. Move items up and down (or drag them), and hide the ones you don't use. */
function MenuEditor() {
  const s = useStore();
  const menu = s.settings.mail.menu;
  const order = menuOrder(menu);
  const [drag, setDrag] = useState<string | null>(null);
  const set = (next: typeof menu) => s.updateSettings((st) => void (st.mail.menu = next));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h4 style={{ margin: "8px 0 0" }}>Right-click menu</h4>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Right-click an email to reply, forward, draft with Claude or Gemini and more. Drag items, or use the arrows, to put them in the
        order you like.
      </div>
      <ol
        className="list"
        style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}
        aria-label="Right-click menu items"
      >
        {order.map((id, i) => {
          const label = MENU_ITEMS.find((x) => x.id === id)!.label;
          const shown = !menu.hidden.includes(id);
          return (
            <li
              key={id}
              className="row"
              draggable
              onDragStart={() => setDrag(id)}
              onDragOver={(e) => drag && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && drag !== id) set(dropMenu(menu, drag, id));
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
              style={{ justifyContent: "space-between", flexWrap: "nowrap", cursor: "grab" }}
            >
              <span className="row">
                <span className="faint mono" aria-hidden="true">
                  {i + 1}
                </span>
                <Toggle checked={shown} onChange={() => set(toggleMenuItem(menu, id))} label={`Show “${label}”`} />{" "}
                <span style={{ opacity: shown ? 1 : 0.5 }}>{label}</span>
              </span>
              <span className="row">
                <button
                  className="btn sm ghost"
                  aria-label={`Move ${label} up`}
                  disabled={i === 0}
                  onClick={() => set(nudgeMenu(menu, id, -1))}
                >
                  ↑
                </button>
                <button
                  className="btn sm ghost"
                  aria-label={`Move ${label} down`}
                  disabled={i === order.length - 1}
                  onClick={() => set(nudgeMenu(menu, id, 1))}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <div>
        <button className="btn sm ghost" onClick={() => set({ order: [], hidden: [] })}>
          Reset to the standard menu
        </button>
      </div>
    </div>
  );
}

/** Settings: sending and writing: who can send, the signature for each account, saved replies, and the undo time. */
function WritingEditor() {
  const s = useStore();
  const m = s.settings.mail;
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  if (!m.accounts.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h4 style={{ margin: "8px 0 0" }}>Sending and writing</h4>
      {m.accounts.map((a) => (
        <div key={a.id} className="stack" style={{ gap: 4 }}>
          <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
            <b>{a.address}</b>
            {a.canSend ? (
              <span className="faint">Can send</span>
            ) : (
              <button
                className="btn sm primary"
                onClick={() =>
                  allowSending(a).then(
                    () => toast("Sending allowed."),
                    (e: Error) => toast(e.message),
                  )
                }
              >
                Allow sending
              </button>
            )}
          </div>
          <textarea
            className="input"
            rows={2}
            aria-label={`Signature for ${a.address}`}
            placeholder="Signature, added to new messages and replies from this account"
            value={m.signatures[a.id] ?? ""}
            onChange={(e) => s.updateSettings((st) => void (st.mail.signatures[a.id] = e.target.value))}
          />
        </div>
      ))}
      <label className="row">
        Undo for
        <select
          className="input"
          style={{ width: "auto" }}
          value={m.undoSeconds}
          onChange={(e) => s.updateSettings((st) => void (st.mail.undoSeconds = Number(e.target.value)))}
        >
          {[5, 10, 20, 30].map((n) => (
            <option key={n} value={n}>
              {n} seconds
            </option>
          ))}
        </select>
        after pressing Send
      </label>
      <div className="eyebrow">Saved replies (templates)</div>
      {m.templates.map((t) => (
        <div key={t.id} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <span className="ellipsis">
            <b>{t.name}</b> <span className="faint">{t.body.slice(0, 60)}</span>
          </span>
          <button
            className="btn sm ghost"
            onClick={() => s.updateSettings((st) => void (st.mail.templates = st.mail.templates.filter((x) => x.id !== t.id)))}
          >
            Delete
          </button>
        </div>
      ))}
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name, e.g. Confirm a booking"
        maxLength={40}
      />
      <textarea
        className="input"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Hi {first name}, confirming our booking on {date} at {time}."
      />
      <div className="row">
        <button
          className="btn sm"
          disabled={!name.trim() || !body.trim()}
          onClick={() => {
            s.updateSettings((st) => void st.mail.templates.push({ id: crypto.randomUUID().slice(0, 8), name: name.trim(), body }));
            setName("");
            setBody("");
          }}
        >
          Add template
        </button>
        <span className="faint" style={{ fontSize: 12.5 }}>
          Fill-ins: {"{first name}"} {"{name}"} {"{date}"} {"{time}"}
        </span>
      </div>
    </div>
  );
}
