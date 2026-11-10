import { useEffect, useState } from "react";
import { useStore, toast } from "../store";
import { ageLabel, freshness } from "../lib/driveSync";
import { connectDriveSync, driveSyncAvailable, driveSyncNow, enableDriveSync, useDriveSync } from "../lib/driveSyncApp";
import { beginDeviceSignIn, deviceConfigured, type DeviceCode } from "../lib/googleDevice";
import { googleConfigured, googleConnected, googleDisconnect, SCOPES } from "../lib/google";
import { isAndroid, openUrl } from "../lib/platform";
import { SetupGuideButton } from "./SetupGuide";
import { Field, Modal, Toggle } from "./ui";

/** Re-render every 30 s so "synced 4 min ago" and the stale warning stay true. */
function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** A slim bar when this device's calendar may be out of date (the last good Drive sync is older than you allow). */
export function StaleBanner() {
  const d = useStore((s) => s.settings.driveSync);
  const { syncing } = useDriveSync();
  useTick();
  if (!driveSyncAvailable()) return null;
  const f = freshness(d.enabled, d.lastOkAt, d.staleMins);
  if (f.state === "off" || f.state === "fresh" || (f.state === "never" && !d.lastError && syncing)) return null;
  const text =
    f.state === "never"
      ? "Drive sync is on but hasn't finished yet."
      : `Your calendar may be out of date: last synced ${ageLabel(f.ageMins)}.`;
  return (
    <div
      className="row"
      role="status"
      style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, gap: 10 }}
    >
      <span style={{ flex: "1 1 320px" }}>
        <b>{text}</b>
        {d.lastError ? <span style={{ color: "var(--bad)" }}> {d.lastError}</span> : null}
      </span>
      <button className="btn sm" disabled={syncing} onClick={() => driveSyncNow().catch((e: Error) => toast(e.message))}>
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

/** Settings → Phone & sync: sync through Google Drive. */
export function DriveSyncSetup() {
  const d = useStore((s) => s.settings.driveSync);
  const update = useStore((s) => s.updateSettings);
  const { syncing, peers, repaired, errors } = useDriveSync();
  const [busy, setBusy] = useState(false);
  useTick();
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const android = isAndroid();
  const [code, setCode] = useState(false);
  const email = useStore((s) => s.settings.email);
  const connected = googleConnected(SCOPES.drive);
  const ready = android ? deviceConfigured() : googleConfigured();
  const f = freshness(d.enabled, d.lastOkAt, d.staleMins);
  return (
    <div className="stack">
      <div className="faint" style={{ fontSize: 12.5 }}>
        Each device writes one file into a “Calendar Assistant (sync)” folder in your Google Drive (the app can only see files it made
        itself), and reads the others'. No server to run. It carries your calendar, tasks, notes, contacts, shopping list and shared
        preferences, never API keys or sign-ins. Changes appear within a few minutes.
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <SetupGuideButton kind="google" label="Step-by-step setup guide" />
        <span className="faint" style={{ fontSize: 12.5 }}>
          Needs a free Google setup first. The guide walks you through it.
        </span>
      </div>
      {!d.enabled ? (
        android ? (
          <div className="stack">
            <div className="faint" style={{ fontSize: 12.5 }}>
              The phone signs in with a short code you type at google.com/device. In Google Cloud, create an OAuth client of type “TVs and
              Limited Input devices” in the same project as your Windows client, then enter its ID and secret here (step by step in
              docs/DRIVE_SYNC.md).
            </div>
            <Field label="Client ID (TVs and Limited Input devices)">
              <input
                className="input mono"
                value={email.googleDeviceClientId}
                onChange={(e) => update((st) => void (st.email.googleDeviceClientId = e.target.value.trim()))}
                placeholder="xxxx.apps.googleusercontent.com"
              />
            </Field>
            <Field label="Client secret">
              <input
                className="input mono"
                type="password"
                value={email.googleDeviceClientSecret}
                onChange={(e) => update((st) => void (st.email.googleDeviceClientSecret = e.target.value.trim()))}
                placeholder="GOCSPX-…"
              />
            </Field>
            <div className="row">
              {connected ? (
                <button className="btn primary" disabled={busy} onClick={() => run(enableDriveSync, "Drive sync is on.")}>
                  Turn on Drive sync
                </button>
              ) : (
                <button className="btn primary" disabled={!ready} onClick={() => setCode(true)}>
                  Get a sign-in code
                </button>
              )}
              {connected && <span className="faint">Signed in to Google Drive on this phone.</span>}
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={!ready || busy} onClick={() => run(connectDriveSync, "Drive sync is on.")}>
              {busy ? "Waiting for your browser…" : connected ? "Turn on Drive sync" : "Connect Google and turn on Drive sync"}
            </button>
            {!ready && <span className="faint">Add your Google client ID under Email, Google & Outlook first.</span>}
          </div>
        )
      ) : (
        <>
          <span className="row">
            <Toggle checked={d.enabled} onChange={(v) => update((s) => void (s.driveSync.enabled = v))} label="Drive sync" /> Sync through
            Google Drive every
            <select
              className="input"
              style={{ width: "auto" }}
              aria-label="How often to sync through Drive"
              value={d.everyMins}
              onChange={(e) => update((s) => void (s.driveSync.everyMins = Number(e.target.value)))}
            >
              {[1, 5, 15, 30].map((n) => (
                <option key={n} value={n}>{`${n} minute${n > 1 ? "s" : ""}`}</option>
              ))}
            </select>
            , when the app opens, and soon after you change something
          </span>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" disabled={busy || syncing} onClick={() => run(driveSyncNow, "Synced through Drive.")}>
              {syncing || busy ? "Syncing…" : "Sync now"}
            </button>
            <span role="status" style={{ fontSize: 13, color: f.state === "stale" ? "var(--warn)" : undefined }}>
              {f.state === "never" ? "Not synced yet." : `Last synced ${ageLabel(f.ageMins)}.`}
            </span>
          </div>
          {d.lastError && (
            <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
              Last sync failed: {d.lastError}
            </div>
          )}
          {peers.length > 0 && (
            <div className="stack" style={{ gap: 4 }}>
              {peers.map((p) => (
                <div key={p.id} className="row" style={{ fontSize: 13 }}>
                  <span className={"dot " + (p.inSync ? "ok" : "")} />
                  <b>{p.name}</b> <span className="muted">({p.platform})</span>
                  <span className="muted">{p.inSync ? "matches this device" : "will catch up on its next sync"}</span>
                  <span className="faint">· wrote {ageLabel(Math.floor((Date.now() - p.writtenAt) / 60_000))}</span>
                </div>
              ))}
            </div>
          )}
          {!peers.length && f.state === "fresh" && (
            <div className="faint" style={{ fontSize: 12.5 }}>
              No other device has synced through Drive yet.
            </div>
          )}
          {repaired > 0 && (
            <div className="faint" style={{ fontSize: 12.5 }}>
              The consistency check re-applied {repaired} record{repaired > 1 ? "s" : ""} that hadn't landed.
            </div>
          )}
          {errors.length > 0 && (
            <div className="faint" style={{ fontSize: 12.5 }}>
              Skipped: {errors.join(" · ")}
            </div>
          )}
          {android && (
            <div>
              <button
                className="btn sm ghost"
                onClick={() => (
                  googleDisconnect(),
                  update((st) => void (st.driveSync.enabled = false)),
                  toast("Signed out of Google Drive on this phone.")
                )}
              >
                Sign out of Google Drive
              </button>
            </div>
          )}
          <span className="row">
            Warn me if the calendar hasn't synced for
            <select
              className="input"
              style={{ width: "auto" }}
              aria-label="When to warn that the calendar is out of date"
              value={d.staleMins}
              onChange={(e) => update((s) => void (s.driveSync.staleMins = Number(e.target.value)))}
            >
              {[15, 30, 60, 120].map((n) => (
                <option key={n} value={n}>
                  {n < 60 ? `${n} minutes` : `${n / 60} hour${n > 60 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </span>
        </>
      )}
      {code && (
        <DeviceCodeModal
          onClose={() => setCode(false)}
          onDone={() => (setCode(false), run(enableDriveSync, "Signed in. Drive sync is on."))}
        />
      )}
    </div>
  );
}

/** Android: shows the code to type at google.com/device, and waits for it. */
function DeviceCodeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [state, setState] = useState<{ code?: DeviceCode; error?: string }>({});
  useTick(1000);
  useEffect(() => {
    let alive = true;
    let cancel = () => {};
    beginDeviceSignIn().then(
      ({ code, done, cancel: c }) => {
        cancel = c;
        if (!alive) return c();
        setState({ code });
        done.then(
          () => alive && onDone(),
          (e: Error) => alive && setState((x) => ({ ...x, error: e.message })),
        );
      },
      (e: Error) => alive && setState({ error: e.message }),
    );
    return () => {
      alive = false;
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const left = state.code ? Math.max(0, Math.round((state.code.expiresAt - Date.now()) / 1000)) : 0;
  return (
    <Modal
      title="Sign in to Google Drive"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          {state.code && (
            <button className="btn primary" onClick={() => openUrl(state.code!.url)}>
              Open google.com/device
            </button>
          )}
        </>
      }
    >
      <div className="stack" role="status" aria-live="polite">
        {state.error ? (
          <div role="alert" style={{ color: "var(--bad)" }}>
            {state.error}
          </div>
        ) : !state.code ? (
          <div className="muted">Getting a code from Google…</div>
        ) : (
          <>
            <div>
              On any device, open <b>google.com/device</b> and enter this code:
            </div>
            <div className="mono" style={{ fontSize: 32, fontWeight: 700, letterSpacing: ".08em" }}>
              {state.code.userCode}
            </div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              Choose your Google account and allow “Calendar Assistant” to create and use its own Drive folder. This window closes by itself
              when it's done. The code works for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}.
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
