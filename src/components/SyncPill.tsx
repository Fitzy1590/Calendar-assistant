import { useEffect, useState } from "react";
import { onSyncStatus } from "../lib/sync";
import { SyncPanel } from "./SyncPanel";

/** Top-bar sync status: a dot and a short word. Opens the sync panel. */
export function SyncPill() {
  const [open, setOpen] = useState(false);
  const [sync, setSync] = useState<{ status: string; peers: string[] }>({ status: "off", peers: [] });
  useEffect(() => {
    const off = onSyncStatus((status, peers) => setSync({ status, peers }));
    return () => void off();
  }, []);
  const label =
    sync.status === "online" ? "Synced" : sync.status === "connecting" ? "Connecting" : sync.status === "offline" ? "Offline" : "Sync off";
  const full =
    sync.status === "online"
      ? `Synced with ${sync.peers.length} device${sync.peers.length === 1 ? "" : "s"}`
      : sync.status === "offline"
        ? "Offline, changes are queued"
        : label;
  const tone = sync.status === "online" ? "ok" : sync.status === "connecting" ? "warn" : sync.status === "offline" ? "bad" : "";
  return (
    <>
      <button className="sync-pill" onClick={() => setOpen(true)} title={full} aria-label={`${full}. Open sync settings`}>
        <span className={"dot " + tone} aria-hidden="true" />
        <span className="hide-sm">{label}</span>
      </button>
      {open && <SyncPanel onClose={() => setOpen(false)} />}
    </>
  );
}
