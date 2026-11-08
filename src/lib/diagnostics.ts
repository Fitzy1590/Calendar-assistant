import { useStore } from "../store";
import { isAndroid, isTauri } from "./platform";
import { WEBVIEW2_URL } from "./errors";

/**
 * System check: does this device have what the app needs? Run quietly on first launch (only problems
 * are surfaced) and on demand from Settings → Diagnostics.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "info";
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: { label: string; url?: string; page?: "settings" };
}

const MIN_WEBVIEW = 110;

export async function runSystemCheck(): Promise<Check[]> {
  const s = useStore.getState().settings;
  const out: Check[] = [];
  const ua = navigator.userAgent;

  // the web engine: WebView2 on Windows, Android System WebView on phones
  const edge = ua.match(/Edg\/(\d+)/)?.[1];
  const chrome = ua.match(/Chrome\/(\d+)/)?.[1];
  const engineVersion = Number(edge ?? chrome ?? 0);
  if (isTauri() && !isAndroid()) {
    out.push(
      engineVersion >= MIN_WEBVIEW
        ? { id: "webview", label: "Microsoft Edge WebView2", status: "ok", detail: `Version ${engineVersion}` }
        : {
            id: "webview",
            label: "Microsoft Edge WebView2",
            status: "warn",
            detail: `Version ${engineVersion || "unknown"} is old; some features may not work.`,
            fix: { label: "Update WebView2", url: WEBVIEW2_URL },
          },
    );
  } else if (isAndroid()) {
    out.push(
      engineVersion >= MIN_WEBVIEW
        ? { id: "webview", label: "Android System WebView", status: "ok", detail: `Version ${engineVersion}` }
        : {
            id: "webview",
            label: "Android System WebView",
            status: "warn",
            detail: `Version ${engineVersion || "unknown"} is old. Update “Android System WebView” and Chrome in the Play Store.`,
            fix: { label: "Open in Play Store", url: "https://play.google.com/store/apps/details?id=com.google.android.webview" },
          },
    );
  }

  // features the app relies on
  const missing = [
    typeof structuredClone !== "function" && "structuredClone",
    typeof ResizeObserver === "undefined" && "ResizeObserver",
    !CSS?.supports?.("color", "color-mix(in srgb, red 50%, blue)") && "color-mix",
    typeof crypto?.randomUUID !== "function" && "randomUUID",
  ].filter(Boolean) as string[];
  out.push(
    missing.length
      ? {
          id: "features",
          label: "Web features",
          status: "fail",
          detail: `Missing: ${missing.join(", ")}. Update ${isAndroid() ? "Android System WebView" : "WebView2"}.`,
          fix: isAndroid() ? undefined : { label: "Update WebView2", url: WEBVIEW2_URL },
        }
      : { id: "features", label: "Web features", status: "ok", detail: "Everything the app needs is available." },
  );

  // internet
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m", {
      signal: AbortSignal.timeout(8000),
    });
    out.push({
      id: "internet",
      label: "Internet",
      status: r.ok ? "ok" : "warn",
      detail: r.ok ? "Connected." : `Weather service answered ${r.status}.`,
    });
  } catch {
    out.push({
      id: "internet",
      label: "Internet",
      status: "warn",
      detail: "Couldn't reach the internet. Weather, news, sports and sync need a connection; everything else works offline.",
    });
  }

  // storage
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    if (est?.quota) {
      const freeMb = Math.round(((est.quota ?? 0) - (est.usage ?? 0)) / 1048576);
      out.push({
        id: "storage",
        label: "Storage",
        status: freeMb < 50 ? "warn" : "ok",
        detail: `${freeMb.toLocaleString()} MB free for the app${persisted ? ", protected from automatic clean-up" : ""}.`,
      });
    }
    if (persisted === false) await navigator.storage?.persist?.().catch(() => false);
  } catch {
    /* not available */
  }

  // notifications
  try {
    let granted: boolean;
    if (isTauri()) {
      const n = await import("@tauri-apps/plugin-notification");
      granted = await n.isPermissionGranted();
    } else granted = typeof Notification !== "undefined" && Notification.permission === "granted";
    out.push(
      granted
        ? { id: "notifications", label: "Notifications", status: "ok", detail: "Reminders can pop up." }
        : {
            id: "notifications",
            label: "Notifications",
            status: s.reminders.desktopNotifications ? "warn" : "info",
            detail:
              "Not allowed yet: reminders only show inside the app. Allow notifications for Calendar Assistant in your device settings.",
          },
    );
  } catch {
    /* plugin unavailable */
  }

  // microphone (only matters if voice is used)
  if (s.voice.wakeWord || s.assistant.voiceLang) {
    try {
      const st = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
      const hasMic = devices.some((d) => d.kind === "audioinput");
      out.push(
        !hasMic
          ? {
              id: "mic",
              label: "Microphone",
              status: s.voice.wakeWord ? "warn" : "info",
              detail: "No microphone found. Voice commands and “Hey Planner” need one.",
            }
          : st?.state === "denied"
            ? {
                id: "mic",
                label: "Microphone",
                status: "warn",
                detail: "Blocked. Allow the microphone for Calendar Assistant in your device's privacy settings.",
              }
            : {
                id: "mic",
                label: "Microphone",
                status: "ok",
                detail: st?.state === "granted" ? "Allowed." : "Found; you'll be asked the first time you use voice.",
              },
      );
    } catch {
      /* permissions API unavailable */
    }
  }

  // location
  try {
    const st = await navigator.permissions?.query({ name: "geolocation" });
    out.push(
      st?.state === "denied"
        ? {
            id: "location",
            label: "Location",
            status: "info",
            detail: s.location
              ? `Blocked; using your saved suburb (${s.location.name}) instead.`
              : "Blocked, and no suburb saved. Set your suburb in Settings for weather and nearby shops.",
            fix: s.location ? undefined : { label: "Set location", page: "settings" },
          }
        : {
            id: "location",
            label: "Location",
            status: s.location ? "ok" : "info",
            detail: s.location ? `Home: ${s.location.name}.` : "No suburb set yet.",
            fix: s.location ? undefined : { label: "Set location", page: "settings" },
          },
    );
  } catch {
    /* permissions API unavailable */
  }

  // sync
  if (s.sync.enabled && s.sync.serverUrl) {
    try {
      const base = s.sync.serverUrl.replace(/^ws/, "http").replace(/\/$/, "");
      const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(6000) });
      out.push({ id: "sync", label: "Sync server", status: r.ok ? "ok" : "warn", detail: r.ok ? "Reachable." : `Answered ${r.status}.` });
    } catch {
      out.push({
        id: "sync",
        label: "Sync server",
        status: "warn",
        detail: "Can't reach the sync server. Changes are saved here and sent when it's back.",
        fix: { label: "Sync settings", page: "settings" },
      });
    }
  }

  return out;
}

export const problems = (checks: Check[]) => checks.filter((c) => c.status === "warn" || c.status === "fail");
