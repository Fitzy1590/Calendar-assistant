import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { isAndroid, isTauri } from "./platform";
import { backAction, type BackAction, type BackState } from "./backButton";
import { upcomingReminders } from "./reminders";
import { planNotifications } from "./reminderSchedule";

const onAndroidApp = () => isTauri() && isAndroid();

/* ---------------- Back button ---------------- */

const visible = (el: Element | null) => !!el && (el as HTMLElement).offsetParent !== null;
function readBackState(): BackState {
  const s = useStore.getState();
  return {
    dialogOpen: !!document.querySelector('[role="dialog"]'),
    assistantOpen: s.assistantOpen,
    dayOpen: !!s.selectedDay,
    readerOpen: visible(document.querySelector(".reader-back")),
    page: s.page,
  };
}
function perform(a: BackAction) {
  const s = useStore.getState();
  if (a === "close-dialog")
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // every dialog closes on Esc
  else if (a === "close-assistant") s.setUi({ assistantOpen: false });
  else if (a === "close-day") s.selectDay(null);
  else if (a === "close-reader") document.querySelector<HTMLButtonElement>(".reader-back")?.click();
  else s.setPage("home");
}

/**
 * Android Back: close what is open, then go Home, then leave the app. The listener is only registered while there is
 * something to close, so Android's own behaviour (leaving the app) applies from a clean Home screen.
 */
export function useAndroidBack() {
  const armed = useRef(false);
  useEffect(() => {
    if (!onAndroidApp()) return () => {};
    let unregister: (() => void) | null = null;
    let busy = false;
    const sync = async () => {
      const want = backAction(readBackState()) !== null;
      if (want === armed.current || busy) return;
      busy = true;
      armed.current = want;
      try {
        if (want) {
          const { onBackButtonPress } = await import("@tauri-apps/api/app");
          const l = await onBackButtonPress(() => {
            const a = backAction(readBackState());
            if (a) perform(a);
          });
          unregister = () => void l.unregister();
        } else {
          unregister?.();
          unregister = null;
        }
      } catch {
        armed.current = false; // not available: Android keeps its default
      }
      busy = false;
      void sync();
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void sync());
    };
    const off = useStore.subscribe(schedule);
    const mo = new MutationObserver(schedule); // dialogs and the mail reader open without touching the store
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    schedule();
    return () => {
      off();
      mo.disconnect();
      cancelAnimationFrame(frame);
      unregister?.();
    };
  }, []);
}

/* ---------------- Reminders that fire with the app closed ---------------- */

let scheduling = false;
/** True once reminders are handed to Android; the in-app 30 s check then stays quiet so nothing fires twice. */
export const remindersScheduled = () => scheduling;

const IDS_KEY = "scheduled-reminder-ids";
const savedIds = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(IDS_KEY) || "[]");
  } catch {
    return [];
  }
};

async function reschedule() {
  const s = useStore.getState();
  const n = await import("@tauri-apps/plugin-notification");
  if (!s.settings.onboarded || !s.settings.reminders.desktopNotifications) {
    scheduling = false;
    const old = savedIds();
    if (old.length) await n.cancel(old);
    localStorage.setItem(IDS_KEY, "[]");
    return;
  }
  let ok = await n.isPermissionGranted();
  if (!ok) ok = (await n.requestPermission()) === "granted";
  if (!ok) return;
  const now = new Date();
  const plan = planNotifications(upcomingReminders(7, now), now);
  const old = savedIds();
  if (old.length) await n.cancel(old);
  for (const p of plan) n.sendNotification({ id: p.id, title: p.title, body: p.body, schedule: n.Schedule.at(p.at, false, true) });
  localStorage.setItem(IDS_KEY, JSON.stringify(plan.map((p) => p.id)));
  scheduling = true;
}

/** Android app: keep the next week of reminders scheduled with the OS. Re-plans a few seconds after any change. */
export function startReminderSchedule(): () => void {
  if (!onAndroidApp()) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void reschedule().catch(() => (scheduling = false)), 3000);
  };
  const off = useStore.subscribe((s, prev) => {
    if (
      s.events !== prev.events ||
      s.tasks !== prev.tasks ||
      s.contacts !== prev.contacts ||
      s.settings.reminders !== prev.settings.reminders
    )
      run();
  });
  const daily = setInterval(run, 6 * 36e5); // the 7-day window slides forward even if nothing is edited
  const onShow = () => document.visibilityState === "visible" && run();
  document.addEventListener("visibilitychange", onShow);
  run();
  return () => {
    clearTimeout(timer);
    clearInterval(daily);
    off();
    document.removeEventListener("visibilitychange", onShow);
  };
}
