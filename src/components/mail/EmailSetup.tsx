import { useState } from "react";
import { format } from "date-fns";
import { useStore } from "../../store";
import { reclassifyCached, syncMail } from "../../lib/mail/engine";
import { connectGmail, connectImap, disconnectAccount, otherMailAvailable } from "../../lib/mail/accounts";
import { domainOf, guessImap } from "../../lib/mail/imapPresets";
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
  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setError("");
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
      {error && (
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
