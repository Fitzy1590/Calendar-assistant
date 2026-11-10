import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { forceSync, onSyncStatus, syncInfo } from "../lib/sync";
import { driveSyncNow } from "../lib/driveSyncApp";
import { googleConnected, quietly, SCOPES, syncGoogleCalendar } from "../lib/google";
import { Modal } from "./ui";

/** What sync is doing right now, in plain words, with a "Sync now" button. */
export function SyncPanel({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [info, setInfo] = useState(syncInfo());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const off = onSyncStatus(() => setInfo(syncInfo()));
    const t = setInterval(() => setInfo(syncInfo()), 5000);
    return () => (off(), clearInterval(t));
  }, []);
  const sy = s.settings.sync;
  const now = async () => {
    setBusy(true);
    forceSync();
    if (s.settings.google.calendarSync && googleConnected(SCOPES.calendar)) await quietly(syncGoogleCalendar).catch(() => {});
    if (s.settings.driveSync.enabled) await driveSyncNow().catch(() => {});
    setTimeout(() => setBusy(false), 1500);
  };
  const state =
    !sy.enabled || !sy.serverUrl
      ? "Sync is off on this device."
      : info.status === "online"
        ? info.peers.length
          ? `Connected. Your other device${info.peers.length > 1 ? "s are" : " is"} online: changes appear there within a second.`
          : "Connected. Your other devices will catch up the moment they open."
        : info.status === "connecting"
          ? "Connecting…"
          : "Offline. Changes are saved here and sent automatically when the connection is back.";
  return (
    <Modal
      title="Sync"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => (onClose(), s.setPage("settings"))}>
            Sync settings
          </button>
          <button className="btn primary" disabled={!sy.enabled || busy} onClick={now}>
            {busy ? "Syncing…" : "Sync now"}
          </button>
        </>
      }
    >
      <div className="row">
        <span
          className={
            "dot " + (info.status === "online" ? "ok" : info.status === "offline" ? "bad" : info.status === "connecting" ? "warn" : "")
          }
        />{" "}
        <b>{state}</b>
      </div>
      <div className="list">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Last synced</span>
          <span>{info.lastSyncedAt ? `${formatDistanceToNowStrict(info.lastSyncedAt)} ago` : "not yet"}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Waiting to send</span>
          <span>{info.pending ? `${info.pending} change${info.pending > 1 ? "s" : ""}` : "nothing"}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Other devices online</span>
          <span>{info.peers.length ? info.peers.map((p) => p.split(":")[1] || p).join(", ") : "none right now"}</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">Preferences shared</span>
          <span>{sy.shareSettings ? "yes" : "no (this device only)"}</span>
        </div>
      </div>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Sync now does a full two-way catch-up: it fetches everything from the sync server and re-sends everything on this device. Use it if
        something you changed on the other device isn't showing.
      </div>
    </Modal>
  );
}
