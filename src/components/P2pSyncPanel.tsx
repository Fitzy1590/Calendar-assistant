import { useState } from "react";
import { format } from "date-fns";
import { useStore, toast } from "../store";
import { useP2p } from "../lib/sync/p2pStatus";
import { diagEnabled, exportDiagnostic, setDiag } from "../lib/sync/diagnostics";

/** Real-time sync status. The dark HUD look is scoped to this panel (`.sync-hud` in styles.css). */
export function P2pSyncPanel() {
  const sync = useStore((s) => s.settings.sync);
  const st = useP2p();
  const [diag, setDiagState] = useState(diagEnabled());
  const ready = !!sync.serverUrl && sync.pairingCode.length >= 8;
  const on = (v: boolean) => useStore.getState().updateSettings((s) => void (s.sync.p2p = v));

  const [label, tone] = !sync.p2p
    ? ["Off", "mute"]
    : !ready
      ? ["Needs setup", "amber"]
      : st.peers > 0
        ? [`Direct · ${st.peers} device${st.peers > 1 ? "s" : ""}`, "mint"]
        : st.relay
          ? ["Relay only", "cyan"]
          : st.signaling
            ? ["Waiting for a device", "amber"]
            : ["Offline", "amber"];

  return (
    <div className="sync-hud" role="group" aria-label="Real-time sync">
      <header className="hud-head">
        <span className="hud-title">Status</span>
        <span className={`hud-chip ${tone}`} role="status">
          {label}
        </span>
      </header>
      <p className="hud-note">
        Changes made on your phone and PC merge field by field, so finishing a task on one device while moving its date on the other keeps
        both. Devices on the same Wi-Fi connect directly; otherwise the relay carries the changes. Uses the server address and pairing code
        from “Sync with Android and calling”.
      </p>
      <button type="button" role="switch" aria-checked={sync.p2p} className="hud-switch" onClick={() => on(!sync.p2p)}>
        <span className="hud-knob" aria-hidden="true" />
        <span>Use real-time sync on this device</span>
      </button>
      {sync.p2p && (
        <p className="hud-note hud-warn">
          While this is on, the older per-record relay sync and Google Drive sync are paused for events, tasks, notes, contacts and
          shopping.
        </p>
      )}
      {!ready && <p className="hud-note hud-warn">Set the server address and a pairing code of at least 8 characters first.</p>}
      {st.error && (
        <p className="hud-note hud-warn" role="alert">
          {st.error}
        </p>
      )}
      <dl className="hud-grid">
        <dt>Direct link</dt>
        <dd>{sync.p2p ? `${st.peers} device${st.peers === 1 ? "" : "s"}` : "—"}</dd>
        <dt>Finding devices</dt>
        <dd>{sync.p2p ? (st.signaling ? "connected" : "offline") : "—"}</dd>
        <dt>Relay</dt>
        <dd>{sync.p2p ? (st.relay ? `connected${st.relayRtt !== null ? ` · ${st.relayRtt} ms` : ""}` : "offline") : "—"}</dd>
        <dt>Last change from another device</dt>
        <dd>{st.lastRemoteAt ? format(st.lastRemoteAt, "HH:mm:ss") : "none yet"}</dd>
        <dt>Speed on a direct link</dt>
        <dd>not measured</dd>
      </dl>
      <div className="hud-actions">
        <button
          type="button"
          role="switch"
          aria-checked={diag}
          className="hud-switch"
          onClick={() => {
            setDiag(!diag);
            setDiagState(!diag);
          }}
        >
          <span className="hud-knob" aria-hidden="true" />
          <span>Record sync diagnostics</span>
        </button>
        <button type="button" className="hud-btn" onClick={() => exportDiagnostic().then((m) => m && toast(m))}>
          Export diagnostic package
        </button>
      </div>
    </div>
  );
}
