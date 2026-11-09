import { useStore } from "../store";
import { googleConnected, googleSignInAvailable, quietly, SCOPES, syncGoogleCalendar } from "./google";
import { syncDue } from "./googleMap";

/**
 * Automatic Google Calendar sync: when the app opens, when its window comes back into view, and then every
 * `settings.google.syncEveryMins` minutes. Silent: no sign-in window, no toast. A failure is shown in Settings.
 * Runs only where Google sign-in lives (the Windows app / browser); the phone gets the result through app sync.
 */
export function startGoogleAutoSync(): () => void {
  let lastAttempt = 0;
  const check = (onOpen = false) => {
    const g = useStore.getState().settings.google;
    if (!googleSignInAvailable() || !g.calendarSync || g.syncEveryMins <= 0 || !googleConnected(SCOPES.calendar)) return;
    const last = Math.max(lastAttempt, g.lastCalendarSyncAt ?? 0);
    // opening or refocusing the app syncs if the last one is over a minute old; otherwise wait for the interval
    if (!syncDue(onOpen ? 1 : g.syncEveryMins, last)) return;
    lastAttempt = Date.now();
    quietly(syncGoogleCalendar).catch(() => {}); // the reason is stored in settings.google.lastCalendarSyncError
  };
  const onFocus = () => check(true);
  const onVisible = () => document.visibilityState === "visible" && check(true);
  check(true);
  const timer = setInterval(() => check(), 60_000);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
