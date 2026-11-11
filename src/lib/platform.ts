/** Thin layer over Tauri so the same UI also runs in a normal browser during development. */

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isAndroid = () => /android/i.test(navigator.userAgent);
/**
 * Browser mode: the Windows app serving itself to the normal web browser on this PC because WebView2
 * isn't usable (see src-tauri/src/browser_mode.rs). Same features as the browser build, plus a repair button.
 */
export const BROWSER_MODE_PORTS = [47821, 47822, 47823, 47824];
export const isBrowserMode = () =>
  typeof location !== "undefined" && location.hostname === "127.0.0.1" && BROWSER_MODE_PORTS.includes(Number(location.port));

export const platformName = () => (isAndroid() ? "android" : isTauri() ? "windows" : isBrowserMode() ? "windows-browser" : "browser");

/** Tell the local server the page is still open (it shuts down a few minutes after the last tab closes). */
export function startBrowserModeHeartbeat() {
  if (!isBrowserMode()) return;
  const ping = () => fetch("/__alive", { cache: "no-store" }).catch(() => {});
  ping();
  setInterval(ping, 20_000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && ping());
}

/** Ask the Windows app to repair WebView2 (one admin prompt), then open as the normal app. */
export async function requestWebViewRepair(): Promise<string> {
  if (isBrowserMode()) {
    const r = await fetch("/__fix-webview", { method: "POST" });
    return r.ok
      ? "Windows will ask for permission to repair WebView2. When it's done, the app opens in its own window."
      : "Couldn't start the repair.";
  }
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("repair_webview");
    return "WebView2 repaired.";
  }
  return "Repair is only available in the Windows app.";
}

export async function webviewStatus(): Promise<string> {
  if (!isTauri() || isAndroid()) return "";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("webview_status").catch(() => "");
}

export async function openUrl(url: string) {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    return openUrl(url);
  }
  window.open(url, "_blank", "noopener");
}

export async function notify(title: string, body: string, opts: { silent?: boolean } = {}) {
  if (isTauri()) {
    const n = await import("@tauri-apps/plugin-notification");
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === "granted";
    if (ok) n.sendNotification({ title, body, ...(opts.silent ? { silent: true } : {}) });
    return;
  }
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission === "granted") new Notification(title, { body, silent: !!opts.silent });
}

/** Windows: tell the native shell whether closing the window should hide it to the tray. */
export function startTraySetting() {
  if (!isTauri() || isAndroid()) return;
  import("../store").then(({ useStore }) => {
    let last: boolean | undefined;
    const push = () => {
      const v = useStore.getState().settings.voice.closeToTray;
      if (v === last) return;
      last = v;
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_close_to_tray", { enabled: v }).catch(() => {}));
    };
    push();
    useStore.subscribe(push);
  });
}
