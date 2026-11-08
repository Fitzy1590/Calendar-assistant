import { create } from "zustand";
import { useStore } from "../store";
import { isAndroid, isTauri, openUrl } from "./platform";

/**
 * App updates.
 *  - Windows: Tauri's updater. It reads latest.json from the newest GitHub Release, checks the update's
 *    signature against the public key built into the app, then installs and relaunches.
 *  - Android: the app reads the newest GitHub Release and opens its APK; Android then shows its own
 *    "update this app?" screen (apps can't update themselves silently).
 *  - Browser build: always the latest code, nothing to do.
 */

export const REPO = "Fitzy1590/Calendar-assistant";
const RELEASES = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "none"; checkedAt: number }
  | { kind: "available"; version: string; notes: string; via: "updater" | "apk" | "page"; url?: string }
  | { kind: "downloading"; version: string; received: number; total?: number }
  | { kind: "ready"; version: string } // installed; restarting
  | { kind: "error"; message: string };

export const useUpdates = create<{ state: UpdateState; current: string; prompt: boolean }>(() => ({
  state: { kind: "idle" },
  current: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
  prompt: false,
}));
const set = (state: UpdateState, prompt?: boolean) => useUpdates.setState(prompt === undefined ? { state } : { state, prompt });

export const updatesSupported = () => isTauri();

/** a > b for plain x.y.z versions (a leading "v" is ignored). */
export function newer(a: string, b: string) {
  const pa = a
    .replace(/^v/, "")
    .split(/[.-]/)
    .map((x) => parseInt(x) || 0);
  const pb = b
    .replace(/^v/, "")
    .split(/[.-]/)
    .map((x) => parseInt(x) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

async function currentVersion() {
  if (!isTauri()) return useUpdates.getState().current;
  const { getVersion } = await import("@tauri-apps/api/app");
  const v = await getVersion();
  useUpdates.setState({ current: v });
  return v;
}

let pending: import("@tauri-apps/plugin-updater").Update | null = null;

/**
 * Look for a newer version. `manual` = the user pressed "Check for updates": ignore "skip this version"
 * and report "you're up to date". Returns true when an update is available.
 */
export async function checkForUpdates(manual = false): Promise<boolean> {
  if (!updatesSupported()) {
    if (manual) set({ kind: "error", message: "The browser version is always up to date." });
    return false;
  }
  set({ kind: "checking" });
  const cur = await currentVersion();
  const settings = useStore.getState().settings.updates;
  const done = () => useStore.getState().updateSettings((s) => void (s.updates.lastChecked = Date.now()));
  try {
    if (!isAndroid()) {
      // Windows: the signed updater, when this build has an update key
      const viaUpdater = await checkWithUpdater().catch(() => undefined);
      if (viaUpdater === null) {
        done();
        set({ kind: "none", checkedAt: Date.now() });
        return false;
      }
      if (viaUpdater) {
        done();
        if (!manual && settings.skipVersion === viaUpdater.version) return (set({ kind: "idle" }), false);
        set({ kind: "available", version: viaUpdater.version, notes: viaUpdater.body ?? "", via: "updater" }, true);
        if (!manual && settings.installAutomatically) await installUpdate();
        return true;
      }
    }
    // Android, or a Windows build without an update key: read the newest release directly
    const r = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json" } });
    if (r.status === 404) {
      done();
      set({ kind: "none", checkedAt: Date.now() });
      return false;
    }
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const rel = await r.json();
    done();
    const version = String(rel.tag_name ?? "").replace(/^v/, "");
    if (!version || !newer(version, cur)) {
      set({ kind: "none", checkedAt: Date.now() });
      return false;
    }
    if (!manual && settings.skipVersion === version) return (set({ kind: "idle" }), false);
    const apk = (rel.assets ?? []).find((a: { name: string }) => /\.apk$/i.test(a.name));
    set(
      {
        kind: "available",
        version,
        notes: String(rel.body ?? "").slice(0, 4000),
        via: isAndroid() && apk ? "apk" : "page",
        url: isAndroid() && apk ? apk.browser_download_url : rel.html_url || RELEASES_PAGE,
      },
      true,
    );
    return true;
  } catch (e) {
    set({ kind: "error", message: friendly(e) });
    return false;
  }
}

/** undefined = updater not set up in this build; null = up to date. */
async function checkWithUpdater() {
  const { check } = await import("@tauri-apps/plugin-updater");
  pending?.close().catch(() => {});
  pending = await check({ timeout: 20000 });
  return pending;
}

/** Install the available update: Windows installs and restarts; Android opens the APK. */
export async function installUpdate() {
  const st = useUpdates.getState().state;
  if (st.kind !== "available") return;
  if (st.via !== "updater") {
    if (st.url) await openUrl(st.url);
    return;
  }
  if (!pending) return;
  let received = 0;
  let total: number | undefined;
  try {
    await pending.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength;
      if (ev.event === "Progress") received += ev.data.chunkLength;
      set({ kind: "downloading", version: st.version, received, total });
    });
    set({ kind: "ready", version: st.version });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    set({ kind: "error", message: friendly(e) });
  }
}

export function skipVersion(version: string) {
  useStore.getState().updateSettings((s) => void (s.updates.skipVersion = version));
  useUpdates.setState({ prompt: false, state: { kind: "idle" } });
}

export const dismissPrompt = () => useUpdates.setState({ prompt: false });

function friendly(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  if (/signature/i.test(m))
    return "The download's signature didn't match, so it wasn't installed. Try again later or download it from the Releases page.";
  if (/fetch|network|dns|timed? ?out/i.test(m)) return "Couldn't reach GitHub to check for updates. Check your internet connection.";
  return m;
}

/** On launch: check once (after a short delay so startup stays fast), then every 12 hours while open. */
export function startUpdateChecks() {
  if (!updatesSupported()) return;
  currentVersion().catch(() => {});
  const auto = () => useStore.getState().settings.updates.checkOnLaunch && checkForUpdates(false);
  setTimeout(auto, 8000);
  setInterval(auto, 12 * 3600e3);
}
