import { create } from "zustand";
import { useUpdates } from "./updates";
import { platformName } from "./platform";

/**
 * Turning errors into something a person can act on: what happened in plain English, what to do about
 * it, and a prefilled report. A short log of recent errors is kept on this device for Settings → Diagnostics.
 */

export const REPO = "Fitzy1590/Calendar-assistant";
export const WEBVIEW2_URL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
const LOG_KEY = "error-log";

export interface Explained {
  title: string;
  text: string;
  fix?: { label: string; url?: string; action?: "reload" | "update" | "settings" };
}

export interface LoggedError {
  at: number;
  message: string;
  stack?: string;
  where: string; // "screen" | "background" | page name
}

export function explainError(err: unknown): Explained {
  const msg = String((err as Error)?.message ?? err ?? "");
  if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|network/i.test(msg))
    return {
      title: "Couldn't connect",
      text: "Calendar Assistant couldn't reach the internet or one of the services it uses. Your data is safe on this device. Check your connection; it will try again automatically.",
    };
  if (/QuotaExceeded|quota|storage.*full|ENOSPC/i.test(msg))
    return {
      title: "This device is out of space for the app",
      text: "There isn't enough storage left to save changes. Free up some space, or back up and clear old price history and archived notes.",
      fix: { label: "Open Backup & restore", action: "settings" },
    };
  if (/Loading chunk|dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg))
    return {
      title: "Part of the app didn't load",
      text: "This usually happens right after an update. Restarting the app fixes it.",
      fix: { label: "Restart the app", action: "reload" },
    };
  if (/(structuredClone|ResizeObserver|AbortSignal\.timeout|replaceAll|at\(|toSorted|color-mix) is not (defined|a function)/i.test(msg))
    return {
      title: "A Windows component is out of date",
      text: "Microsoft Edge WebView2 Runtime on this PC is too old for some features. Updating it from Microsoft fixes this.",
      fix: { label: "Update WebView2 (Microsoft)", url: WEBVIEW2_URL },
    };
  if (/permission|NotAllowedError|denied/i.test(msg))
    return {
      title: "Permission needed",
      text: "Windows or Android blocked something the app asked for (like the microphone, location or notifications). You can allow it in your device's settings for Calendar Assistant.",
      fix: { label: "Run the system check", action: "settings" },
    };
  return {
    title: "Something went wrong",
    text: "Calendar Assistant hit a problem it didn't expect. Your data is saved. Trying again or restarting usually helps, and reporting it gets it fixed.",
    fix: { label: "Check for updates", action: "update" },
  };
}

function readLog(): LoggedError[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}

export const useErrors = create<{ log: LoggedError[]; current: (LoggedError & Explained) | null }>(() => ({
  log: readLog(),
  current: null,
}));

export function recordError(err: unknown, where: string, show = true) {
  const e = err as Error;
  const entry: LoggedError = { at: Date.now(), message: String(e?.message ?? err).slice(0, 500), stack: e?.stack?.slice(0, 2000), where };
  const log = [entry, ...useErrors.getState().log].slice(0, 30);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* storage full: keep it in memory */
  }
  const cur = useErrors.getState().current;
  // don't stack alerts for the same problem
  const next = show && (!cur || cur.message !== entry.message) ? { ...entry, ...explainError(err) } : cur;
  useErrors.setState({ log, current: next });
}

export const clearErrorLog = () => {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* ignore */
  }
  useErrors.setState({ log: [] });
};
export const dismissError = () => useErrors.setState({ current: null });

export function reportUrl(e: { message: string; stack?: string; where?: string; title?: string }) {
  const body =
    `**What happened**\n${e.title ?? "An error"}${e.where ? ` (${e.where})` : ""}\n\n` +
    `**App version:** ${useUpdates.getState().current}\n**Device:** ${platformName()} · ${navigator.userAgent}\n\n` +
    "**Details**\n```\n" + `${e.message}\n${e.stack ?? ""}`.slice(0, 3000) + "\n```\n\n_Sent from the app. Add what you were doing when it happened._";
  return `https://github.com/${REPO}/issues/new?labels=bug&title=${encodeURIComponent(`Error: ${e.message.slice(0, 80)}`)}&body=${encodeURIComponent(body)}`;
}

export const detailsText = (e: LoggedError) =>
  `Calendar Assistant ${useUpdates.getState().current} · ${platformName()}\n${new Date(e.at).toISOString()} · ${e.where}\n${e.message}\n${e.stack ?? ""}`;

/** Catch errors nothing else handled (a failed background job, a bug in a button) and explain them. */
export function startErrorCapture() {
  window.addEventListener("error", (ev) => {
    // ignore resource load errors (a missing image or font) and cross-origin "Script error."
    if (!(ev.error instanceof Error) && !ev.message) return;
    if (ev.message === "Script error.") return;
    recordError(ev.error ?? ev.message, "background");
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    // a dropped connection in a background check isn't worth an alert; log it quietly
    const quiet = /Failed to fetch|NetworkError|Load failed|AbortError|timed? ?out/i.test(String(r?.message ?? r));
    recordError(r, "background", !quiet);
  });
}
