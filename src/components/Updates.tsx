import { formatDistanceToNowStrict } from "date-fns";
import { useStore } from "../store";
import { checkForUpdates, dismissPrompt, installUpdate, RELEASES_PAGE, skipVersion, updatesSupported, useUpdates } from "../lib/updates";
import { isAndroid, openUrl } from "../lib/platform";
import { Modal, Toggle } from "./ui";
import { showWhatsNew } from "./WhatsNew";

function Progress() {
  const st = useUpdates((u) => u.state);
  if (st.kind !== "downloading") return null;
  const pct = st.total ? Math.round((st.received / st.total) * 100) : undefined;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct ?? 30}%`, background: "var(--accent)", transition: "width .2s" }} />
      </div>
      <span className="muted" style={{ fontSize: 12.5 }}>
        Downloading {(st.received / 1048576).toFixed(1)} MB{st.total ? ` of ${(st.total / 1048576).toFixed(1)} MB` : ""}… the app restarts
        when it's installed.
      </span>
    </div>
  );
}

/** Shown when a check finds a new version. */
export function UpdatePrompt() {
  const { state, prompt, current } = useUpdates();
  if (!prompt || (state.kind !== "available" && state.kind !== "downloading" && state.kind !== "ready" && state.kind !== "error"))
    return null;
  const version = state.kind === "available" || state.kind === "downloading" || state.kind === "ready" ? state.version : "";
  const busy = state.kind === "downloading" || state.kind === "ready";
  const notes = state.kind === "available" ? state.notes.replace(/^## Install[\s\S]*?(?=## What's in this version|$)/, "").trim() : "";
  return (
    <Modal
      title={`Update to version ${version}`}
      onClose={() => !busy && dismissPrompt()}
      footer={
        busy ? undefined : (
          <>
            {state.kind === "available" && (
              <button className="btn ghost" onClick={() => skipVersion(version)}>
                Skip this version
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={dismissPrompt}>
              Later
            </button>
            {state.kind === "available" && (
              <button className="btn primary" onClick={installUpdate}>
                {state.via === "updater" || state.via === "installer"
                  ? "Update and restart"
                  : isAndroid()
                    ? "Download update"
                    : "Open download page"}
              </button>
            )}
          </>
        )
      }
    >
      <div className="muted">You have version {current}.</div>
      {state.kind === "available" && state.via === "apk" && (
        <div className="muted" style={{ fontSize: 13 }}>
          The update downloads, then Android asks you to confirm installing it. Your data stays on the phone and in sync.
        </div>
      )}
      {notes && (
        <pre
          className="card"
          style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: 13, maxHeight: 260, overflow: "auto" }}
        >
          {notes}
        </pre>
      )}
      <Progress />
      {state.kind === "ready" && <div>Installed. Restarting…</div>}
      {state.kind === "error" && <div className="alert bad">{state.message}</div>}
    </Modal>
  );
}

/** Settings → Updates */
export function UpdateSettings() {
  const s = useStore();
  const u = s.settings.updates;
  const { state, current } = useUpdates();
  const set = (p: Partial<typeof u>) => s.updateSettings((st) => void Object.assign(st.updates, p));
  if (!updatesSupported())
    return (
      <div className="muted">
        You're using the browser version, which is always up to date. The Windows and Android apps update themselves.
      </div>
    );
  const status =
    state.kind === "checking"
      ? "Checking…"
      : state.kind === "none"
        ? "You're on the latest version."
        : state.kind === "available"
          ? `Version ${state.version} is available.`
          : state.kind === "downloading"
            ? "Downloading the update…"
            : state.kind === "ready"
              ? "Installed, restarting…"
              : state.kind === "error"
                ? state.message
                : u.lastChecked
                  ? `Last checked ${formatDistanceToNowStrict(u.lastChecked)} ago.`
                  : "";
  return (
    <div className="stack">
      <div className="row">
        <span>
          Version <b className="mono">{current}</b>
        </span>
        <button
          className="btn sm primary"
          disabled={state.kind === "checking" || state.kind === "downloading"}
          onClick={() => checkForUpdates(true)}
        >
          Check for updates now
        </button>
        {!isAndroid() && (
          <button className="btn sm" onClick={showWhatsNew}>
            What's new
          </button>
        )}
        {state.kind === "available" && (
          <button className="btn sm" onClick={installUpdate}>
            {state.via === "updater" || state.via === "installer" ? "Update and restart" : "Download update"}
          </button>
        )}
        <span
          className={state.kind === "error" ? "" : "muted"}
          style={{ fontSize: 13, color: state.kind === "error" ? "var(--bad)" : undefined }}
        >
          {status}
        </span>
      </div>
      <Progress />
      <span className="row">
        <Toggle checked={u.checkOnLaunch} onChange={(v) => set({ checkOnLaunch: v })} label="Check on launch" /> Check for updates when the
        app starts
      </span>
      {!isAndroid() && (
        <span className="row">
          <Toggle checked={u.installAutomatically} onChange={(v) => set({ installAutomatically: v })} label="Install automatically" />{" "}
          Install updates automatically when the app starts (it restarts by itself)
        </span>
      )}
      {u.skipVersion && (
        <span className="row muted" style={{ fontSize: 13 }}>
          Skipping version {u.skipVersion}.{" "}
          <button className="btn sm ghost" onClick={() => set({ skipVersion: undefined })}>
            Stop skipping
          </button>
        </span>
      )}
      <span className="faint" style={{ fontSize: 12.5 }}>
        {isAndroid()
          ? "Android asks you to confirm each install; it can't update apps silently."
          : "Updates come only from your GitHub releases and are checked before they install (a signature, or GitHub's checksum for the file)."}{" "}
        <button className="btn sm ghost" onClick={() => openUrl(RELEASES_PAGE)}>
          All releases
        </button>
      </span>
    </div>
  );
}
