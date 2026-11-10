import { useEffect } from "react";
import { isFullscreen, setFullscreen, toggleFullscreen } from "./lib/fullscreen";
import { isTyping, pageForKey } from "./lib/shortcuts";
import { isAndroid, isTauri } from "./lib/platform";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { AssistantDrawer, CommandBar } from "./components/Assistant";
import { DayPanel } from "./components/DayPanel";
import { FeedbackModal } from "./components/Feedback";
import { CarryOver } from "./components/CarryOver";
import { EmailImport } from "./components/EmailImport";
import { UpdatePrompt } from "./components/Updates";
import { useRecordNewInstallVersion, WhatsNew } from "./components/WhatsNew";
import { ErrorAlert, ErrorBoundary, useFirstRunCheck } from "./components/Errors";
import { BrowserModeBanner } from "./components/BrowserModeBanner";
import { IFullscreen, IIdea, IMail } from "./components/Icons";
import { Home } from "./pages/Home";
import { Calendar } from "./pages/Calendar";
import { Email } from "./pages/Email";
import { Tasks } from "./pages/Tasks";
import { Contacts } from "./pages/Contacts";
import { Reminders } from "./pages/Reminders";
import { News } from "./pages/News";
import { Sports } from "./pages/Sports";
import { Settings } from "./pages/Settings";
import { Notes } from "./pages/Notes";
import { Shopping } from "./pages/Shopping";
import { Wizard } from "./pages/Wizard";
import { dueNow } from "./lib/reminders";
import { notify } from "./lib/platform";
import { dailyBackups } from "./lib/backup";
import { startGoogleAutoSync } from "./lib/googleAuto";
import { startDriveSync } from "./lib/driveSyncApp";
import { StaleBanner } from "./components/DriveSync";
import { startMailPolling } from "./lib/mail/engine";
import { accentText, CONTRAST_ACCENT, readableOn } from "./lib/themes";
import { checkTrackedPrices } from "./lib/shopping";

const PAGES = {
  home: Home,
  calendar: Calendar,
  email: Email,
  tasks: Tasks,
  notes: Notes,
  shopping: Shopping,
  contacts: Contacts,
  reminders: Reminders,
  news: News,
  sports: Sports,
  settings: Settings,
};

function useTheme() {
  const { theme, accent, density, fontScale } = useStore((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = theme === "system" ? (dark ? "ink" : "paper") : theme;
      // the high-contrast theme uses its own accent; otherwise the chosen one, with readable text on it and as text
      const fill = theme === "contrast" ? CONTRAST_ACCENT : accent;
      root.style.setProperty("--accent", fill);
      root.style.setProperty("--accent-ink", readableOn(fill));
      const surface = getComputedStyle(root).getPropertyValue("--surface").trim() || "#ffffff";
      root.style.setProperty("--accent-text", accentText(fill, surface));
    };
    apply();
    root.dataset.density = density;
    root.style.setProperty("--scale", String(fontScale));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent, density, fontScale]);
}

/** Background jobs: reminder notifications, daily backups, price checks, Google Calendar auto sync. */
function useBackground() {
  useEffect(() => {
    const tickReminders = () => {
      const s = useStore.getState().settings;
      if (!s.onboarded || !s.reminders.desktopNotifications) return;
      for (const r of dueNow()) notify(r.title, r.detail);
    };
    const tickSync = () => {
      const sh = useStore.getState().settings.shopping;
      if (sh.checkPricesDaily)
        checkTrackedPrices()
          .then((n) => sh.notifyDrops && n.forEach((m) => notify("Price drop", m)))
          .catch(() => {});
      dailyBackups();
    };
    tickReminders();
    tickSync();
    const a = setInterval(tickReminders, 30_000);
    const b = setInterval(tickSync, 15 * 60_000);
    const stopGoogle = startGoogleAutoSync();
    const stopMail = startMailPolling();
    const stopDrive = startDriveSync();
    return () => (clearInterval(a), clearInterval(b), stopGoogle(), stopMail(), stopDrive());
  }, []);
}

/** F or F11 toggles full screen, Esc leaves it, 1-9 / 0 open the matching left-menu item. Never while typing or in a dialog. */
function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.key === "F11" && isTauri()) {
        e.preventDefault(); // a browser already has its own F11
        toggleFullscreen().catch(() => {});
        return;
      }
      if (e.key === "Escape" && isTauri()) {
        isFullscreen()
          .then(async (on) => {
            if (on) await setFullscreen(false);
          })
          .catch(() => {});
        return;
      }
      const st = useStore.getState();
      if (!st.settings.onboarded || st.wizardSteps) return;
      if (isTyping(document.activeElement as HTMLElement | null) || document.querySelector('[role="dialog"]')) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen().catch(() => {});
        return;
      }
      const page = pageForKey(
        e.key,
        st.settings.sidebar.filter((x) => x.visible),
      );
      if (page) {
        e.preventDefault();
        st.setPage(page);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** In the Windows app, hide the web view's own right-click menu (Back, Refresh, Save as, Print…). Text boxes and selected text keep theirs. */
function useNoBrowserMenu() {
  useEffect(() => {
    if (!isTauri()) return () => {};
    const onMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return; // a part of the app already showed its own menu
      if (isTyping(e.target as HTMLElement | null) || window.getSelection()?.toString()) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onMenu);
    return () => window.removeEventListener("contextmenu", onMenu);
  }, []);
}

export default function App() {
  const s = useStore();
  useKeyboardShortcuts();
  useNoBrowserMenu();
  useTheme();
  useBackground();
  useFirstRunCheck();
  useRecordNewInstallVersion();
  if (!s.settings.onboarded) return <Wizard />;
  if (s.wizardSteps) return <WizardOverlay steps={s.wizardSteps} />;
  const Page = PAGES[s.page] ?? Home;
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <div className="topbar">
          <CommandBar />
          <span style={{ flex: 1 }} />
          <button
            className="btn ghost"
            onClick={() => s.setUi({ emailImportOpen: true })}
            title="Import events from email or Google Calendar"
          >
            <IMail /> <span className="hide-sm">Import</span>
          </button>
          {isTauri() && !isAndroid() && (
            <button className="btn ghost" onClick={() => toggleFullscreen().catch(() => {})} title="Full screen (F11). Esc to leave.">
              <IFullscreen /> <span className="hide-sm">Full screen</span>
            </button>
          )}
          <button className="btn ghost" onClick={() => s.setUi({ feedbackOpen: true })} title="Suggestions & feedback">
            <IIdea /> <span className="hide-sm">Feedback</span>
          </button>
        </div>
        <BrowserModeBanner />
        <StaleBanner />
        <div className="content">
          {/* a crash in one page shows a recovery screen there; the menu keeps working */}
          <ErrorBoundary key={s.page} where={s.page}>
            <Page />
          </ErrorBoundary>
        </div>
      </main>
      {s.selectedDay && !s.assistantOpen && <DayPanel />}
      {s.assistantOpen && <AssistantDrawer />}
      {s.feedbackOpen && <FeedbackModal />}
      {s.emailImportOpen && <EmailImport />}
      <CarryOver />
      <UpdatePrompt />
      <WhatsNew />
      <ErrorAlert />
      {s.toast && (
        <div className="toast" role="status">
          {s.toast}
        </div>
      )}
    </div>
  );
}

function WizardOverlay({ steps }: { steps: string[] }) {
  // Wizard calls finish() which sets onboarded=true; we close the overlay when setupSkipped changes.
  const setUi = useStore((s) => s.setUi);
  useEffect(() => {
    const unsub = useStore.subscribe((st, prev) => {
      if (st.settings.setupSkipped !== prev.settings.setupSkipped) setUi({ wizardSteps: null });
    });
    return () => unsub();
  }, [setUi]);
  return <Wizard only={steps} />;
}
