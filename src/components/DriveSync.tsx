import { useEffect, useState } from "react";
import { useStore, toast } from "../store";
import { ageLabel, freshness } from "../lib/driveSync";
import { connectDriveSync, driveSyncAvailable, driveSyncNow, useDriveSync } from "../lib/driveSyncApp";
import { googleConfigured, googleConnected, SCOPES } from "../lib/google";
import { isAndroid } from "../lib/platform";
import { Toggle } from "./ui";

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
  if (isAndroid() || !driveSyncAvailable()) return null;
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
  if (isAndroid())
    return (
      <div className="muted">
        Android will join Drive sync in the next step: it signs in with a short code you type at google.com/device. Until then the sync
        server keeps your phone up to date.
      </div>
    );
  const ready = googleConfigured();
  const f = freshness(d.enabled, d.lastOkAt, d.staleMins);
  return (
    <div className="stack">
      <div className="faint" style={{ fontSize: 12.5 }}>
        Each device writes one file into a hidden Google Drive folder that only this app can see, and reads the others'. No server to run.
        It carries your calendar, tasks, notes, contacts, shopping list and shared preferences, never API keys or sign-ins. Changes appear
        within a few minutes.
      </div>
      {!d.enabled ? (
        <div className="row">
          <button className="btn primary" disabled={!ready || busy} onClick={() => run(connectDriveSync, "Drive sync is on.")}>
            {busy
              ? "Waiting for your browser…"
              : googleConnected(SCOPES.drive)
                ? "Turn on Drive sync"
                : "Connect Google and turn on Drive sync"}
          </button>
          {!ready && <span className="faint">Add your Google client ID under Email, Google & Outlook first.</span>}
        </div>
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
    </div>
  );
}
