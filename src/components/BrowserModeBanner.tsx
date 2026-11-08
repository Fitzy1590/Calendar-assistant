import { useState } from "react";
import { isBrowserMode, requestWebViewRepair } from "../lib/platform";

/** Shown when the Windows app is running in the web browser because WebView2 isn't usable. */
export function BrowserModeBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("browser-mode-banner") === "hidden";
    } catch {
      return false;
    }
  });
  const [msg, setMsg] = useState("");
  if (!isBrowserMode() || hidden) return null;
  return (
    <div className="row" role="status" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, gap: 10 }}>
      <span style={{ flex: "1 1 320px" }}>
        <b>Running in your web browser.</b> WebView2 isn't working on this PC, so Calendar Assistant opened here instead. Everything you add is saved and syncs as usual.
        {msg && <span className="muted"> {msg}</span>}
      </span>
      <button className="btn sm" onClick={async () => setMsg(await requestWebViewRepair().catch((e) => String(e)))}>Repair WebView2</button>
      <button className="btn sm ghost" onClick={() => (sessionStorage.setItem("browser-mode-banner", "hidden"), setHidden(true))}>Hide</button>
    </div>
  );
}
