import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { format } from "date-fns";
import { toast, useStore } from "../store";
import { clearErrorLog, detailsText, dismissError, explainError, recordError, reportUrl, useErrors, type Explained } from "../lib/errors";
import { problems, runSystemCheck, type Check } from "../lib/diagnostics";
import { checkForUpdates } from "../lib/updates";
import { exportJsonFile } from "../lib/backup";
import { isAndroid, isBrowserMode, isTauri, openUrl, requestWebViewRepair, webviewStatus } from "../lib/platform";
import { forceSync } from "../lib/sync";

function doFix(fix: Explained["fix"]) {
  if (!fix) return;
  if (fix.url) return void openUrl(fix.url);
  if (fix.action === "reload") return location.reload();
  if (fix.action === "update") return void checkForUpdates(true).then((found) => !found && toast("You're on the latest version."));
  if (fix.action === "settings") {
    useStore.getState().setPage("settings");
    setTimeout(() => window.dispatchEvent(new CustomEvent("settings-search", { detail: "diagnostics" })), 0);
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Details copied");
  } catch {
    toast("Couldn't copy; the details are in Settings → Diagnostics");
  }
}

/** Non-blocking alert for errors that happen while you use the app. */
export function ErrorAlert() {
  const cur = useErrors((s) => s.current);
  const [open, setOpen] = useState(false);
  if (!cur) return null;
  return (
    <div role="alert" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 70, width: "min(420px, calc(100vw - 32px))" }} className="card stack">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <b>{cur.title}</b>
        <button className="btn ghost sm" onClick={dismissError} aria-label="Dismiss">Dismiss</button>
      </div>
      <div className="muted" style={{ fontSize: 13.5 }}>{cur.text}</div>
      {cur.autoFixed && <div className="alert" style={{ fontSize: 13 }}><b>Fixed automatically:</b> {cur.autoFixed}</div>}
      <div className="row">
        {cur.fix && !cur.autoFixed && <button className="btn sm primary" onClick={() => doFix(cur.fix)}>{cur.fix.label}</button>}
        <button className="btn sm" onClick={() => openUrl(reportUrl(cur))}>Report problem</button>
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? "Hide details" : "Details"}</button>
      </div>
      {open && <pre className="mono" style={{ fontSize: 11.5, whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", margin: 0 }}>{detailsText(cur)}</pre>}
    </div>
  );
}

/** Shown instead of a page (or the whole app) if drawing it crashes. Data is untouched. */
function CrashScreen({ error, where, onRetry, tried }: { error: Error; where: string; onRetry: () => void; tried?: string }) {
  const ex = explainError(error);
  const entry = { at: Date.now(), message: error.message, stack: error.stack, where };
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24 }}>
      <div className="card stack" style={{ maxWidth: 560 }}>
        <h2 style={{ margin: 0, font: "600 22px var(--font-display)" }}>{ex.title}</h2>
        <div>{ex.text}</div>
        <div className="muted" style={{ fontSize: 13 }}>Your events, tasks, notes and settings are saved and not affected.</div>
        {tried && <div className="alert" style={{ fontSize: 13 }}>Already tried automatically: {tried} It still didn't open, so it needs a closer look; reporting it helps.</div>}
        <div className="row">
          <button className="btn primary" onClick={onRetry}>Try again</button>
          <button className="btn" onClick={() => location.reload()}>Restart the app</button>
          {ex.fix?.url && <button className="btn" onClick={() => doFix(ex.fix)}>{ex.fix.label}</button>}
          <button className="btn" onClick={() => exportJsonFile()}>Back up my data</button>
          <button className="btn" onClick={() => openUrl(reportUrl({ ...entry, title: ex.title }))}>Report problem</button>
          <button className="btn ghost" onClick={() => copy(detailsText(entry))}>Copy details</button>
        </div>
        <details>
          <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>Technical details</summary>
          <pre className="mono" style={{ fontSize: 11.5, whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{detailsText(entry)}</pre>
        </details>
      </div>
    </div>
  );
}

/**
 * Catches a crash while drawing. First time: reset that page's layout (data untouched) and retry by
 * itself. If it crashes again, show the recovery screen.
 */
export class ErrorBoundary extends Component<{ where: string; children: ReactNode }, { error: Error | null; tried?: string }> {
  state = { error: null as Error | null, tried: undefined as string | undefined };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    recordError(Object.assign(error, { stack: `${error.stack ?? ""}\n${info.componentStack ?? ""}` }), this.props.where, false);
    if (this.state.tried === undefined) {
      import("../lib/autofix").then(({ resetPageLayout }) => {
        const did = resetPageLayout(this.props.where);
        if (did) {
          toast(`Fixed automatically: ${did}`);
          this.setState({ error: null, tried: did });
        } else this.setState({ tried: "" });
      });
    }
  }
  render() {
    if (this.state.error && this.state.tried !== undefined)
      return <CrashScreen error={this.state.error} where={this.props.where} tried={this.state.tried || undefined} onRetry={() => this.setState({ error: null })} />;
    if (this.state.error) return <div className="empty" style={{ padding: 24 }}>Fixing a problem with this page…</div>;
    return this.props.children;
  }
}

const DOT: Record<Check["status"], string> = { ok: "ok", warn: "warn", fail: "bad", info: "" };

/** Settings → Diagnostics: system check, recent errors, report. */
export function Diagnostics() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [wv, setWv] = useState("");
  const [fixing, setFixing] = useState("");
  const log = useErrors((s) => s.log);
  const run = async () => {
    setBusy(true);
    setChecks(await runSystemCheck());
    setWv(await webviewStatus());
    setBusy(false);
  };
  const repair = async () => {
    setFixing("Repairing WebView2… Windows will ask for permission.");
    try {
      setFixing(await requestWebViewRepair());
    } catch (e) {
      setFixing(String((e as Error)?.message ?? e));
    }
  };
  /** Everything that can be fixed from here without changing Windows settings. */
  const fixAll = async () => {
    const did: string[] = [];
    try {
      if (isTauri()) {
        const n = await import("@tauri-apps/plugin-notification");
        if (!(await n.isPermissionGranted()) && (await n.requestPermission()) === "granted") did.push("notifications allowed");
      } else if (typeof Notification !== "undefined" && Notification.permission === "default" && (await Notification.requestPermission()) === "granted") did.push("notifications allowed");
    } catch {
      /* ignore */
    }
    if (await navigator.storage?.persist?.().catch(() => false)) did.push("storage protected from clean-up");
    if (useStore.getState().settings.sync.enabled) {
      forceSync();
      did.push("sync restarted");
    }
    const { pruneStorage } = await import("../lib/autofix");
    const freed = checks?.some((c) => c.id === "storage" && c.status !== "ok") ? pruneStorage() : "";
    if (freed) did.push(`freed space (${freed})`);
    toast(did.length ? `Fixed: ${did.join(", ")}.` : "Nothing else could be fixed automatically; see the suggestions below.");
    run();
  };
  useEffect(() => {
    run();
  }, []);
  return (
    <div className="stack">
      <div className="row">
        <button className="btn sm primary" onClick={run} disabled={busy}>{busy ? "Checking…" : "Run system check"}</button>
        <button className="btn sm" onClick={fixAll} disabled={busy}>Fix what I can</button>
        {checks && <span className="muted" style={{ fontSize: 13 }}>{problems(checks).length ? `${problems(checks).length} thing${problems(checks).length > 1 ? "s" : ""} need attention` : "Everything looks good."}</span>}
      </div>
      {((isTauri() && !isAndroid()) || isBrowserMode()) && (
        <div className="card stack" style={{ gap: 6 }}>
          <b>Microsoft Edge WebView2</b>
          {wv && <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13 }} className="muted">{wv}</pre>}
          {isBrowserMode() && <div className="muted" style={{ fontSize: 13 }}>You're using Calendar Assistant in your web browser because WebView2 isn't working on this PC.</div>}
          <div className="row">
            <button className="btn sm" onClick={repair}>Repair WebView2</button>
            <span className="faint" style={{ fontSize: 12.5 }}>Undoes WebView2 blocks left by clean-up tools and reinstalls it from Microsoft. Windows asks for permission.</span>
          </div>
          {fixing && <div className="alert" style={{ fontSize: 13 }}>{fixing}</div>}
        </div>
      )}
      {checks && (
        <div className="list">
          {checks.map((c) => (
            <div key={c.id} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <span className="row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
                <span className={"dot " + DOT[c.status]} />
                <span style={{ minWidth: 0 }}><b>{c.label}</b> <span className="muted" style={{ fontSize: 13 }}>{c.detail}</span></span>
              </span>
              {c.fix && <button className="btn sm" onClick={() => (c.fix!.url ? openUrl(c.fix!.url) : useStore.getState().setPage("settings"))}>{c.fix.label}</button>}
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="eyebrow">Recent problems on this device</span>
          {log.length > 0 && <button className="btn sm ghost" onClick={clearErrorLog}>Clear</button>}
        </div>
        <div className="list" style={{ marginTop: 6 }}>
          {log.slice(0, 10).map((e, i) => (
            <div key={e.at + "-" + i} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <span style={{ minWidth: 0 }}>
                <span className="mono faint" style={{ fontSize: 12 }}>{format(e.at, "d MMM h:mm a")}</span> {explainError(e).title}
                <div className="faint" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.message}</div>
              </span>
              <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <button className="btn sm ghost" onClick={() => copy(detailsText(e))}>Copy</button>
                <button className="btn sm" onClick={() => openUrl(reportUrl({ ...e, title: explainError(e).title }))}>Report</button>
              </span>
            </div>
          ))}
          {!log.length && <div className="empty">No problems recorded.</div>}
        </div>
      </div>
      <div className="faint" style={{ fontSize: 12.5 }}>
        If the Windows app ever closes on its own, it shows what went wrong and saves a crash report in
        <span className="mono"> %LOCALAPPDATA%\com.fitzy.calendarassistant\crash-reports</span>.
      </div>
    </div>
  );
}

/** First launch on a device: run the system check quietly and only speak up if something needs fixing. */
export function useFirstRunCheck() {
  const onboarded = useStore((s) => s.settings.onboarded);
  useEffect(() => {
    if (!onboarded) return;
    let done = false;
    try {
      done = localStorage.getItem("system-check-done") === "1";
    } catch {
      /* ignore */
    }
    if (done) return;
    const t = setTimeout(async () => {
      const found = problems(await runSystemCheck());
      try {
        localStorage.setItem("system-check-done", "1");
      } catch {
        /* ignore */
      }
      if (found.length) toast(`System check: ${found.map((c) => c.label).join(", ")} need${found.length > 1 ? "" : "s"} attention. See Settings → Diagnostics.`);
    }, 4000);
    return () => clearTimeout(t);
  }, [onboarded]);
}
