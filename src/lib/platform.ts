/** Thin layer over Tauri so the same UI also runs in a normal browser during development. */

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const platformName = () => (isAndroid() ? "android" : isTauri() ? "windows" : "browser");

export async function openUrl(url: string) {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    return openUrl(url);
  }
  window.open(url, "_blank", "noopener");
}

export async function notify(title: string, body: string) {
  if (isTauri()) {
    const n = await import("@tauri-apps/plugin-notification");
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === "granted";
    if (ok) n.sendNotification({ title, body });
    return;
  }
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission === "granted") new Notification(title, { body });
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
