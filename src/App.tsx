import { useEffect } from "react";
import { useStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { AssistantDrawer, CommandBar } from "./components/Assistant";
import { DayPanel } from "./components/DayPanel";
import { FeedbackModal } from "./components/Feedback";
import { CarryOver } from "./components/CarryOver";
import { EmailImport } from "./components/EmailImport";
import { UpdatePrompt } from "./components/Updates";
import { IIdea, IMail } from "./components/Icons";
import { Home } from "./pages/Home";
import { Calendar } from "./pages/Calendar";
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
import { googleConnected, quietly, SCOPES, syncGoogleCalendar } from "./lib/google";
import { checkTrackedPrices } from "./lib/shopping";

const PAGES = { home: Home, calendar: Calendar, tasks: Tasks, notes: Notes, shopping: Shopping, contacts: Contacts, reminders: Reminders, news: News, sports: Sports, settings: Settings };

function useTheme() {
  const { theme, accent, density, fontScale } = useStore((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = theme === "system" ? (dark ? "ink" : "paper") : theme;
    };
    apply();
    root.dataset.density = density;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--scale", String(fontScale));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, accent, density, fontScale]);
}

/** Background jobs: reminder notifications, daily backups, Google Calendar sync. */
function useBackground() {
  useEffect(() => {
    const tickReminders = () => {
      const s = useStore.getState().settings;
      if (!s.onboarded || !s.reminders.desktopNotifications) return;
      for (const r of dueNow()) notify(r.title, r.detail);
    };
    const tickSync = () => {
      const sh = useStore.getState().settings.shopping;
      if (sh.checkPricesDaily) checkTrackedPrices().then((n) => sh.notifyDrops && n.forEach((m) => notify("Price drop", m))).catch(() => {});
      const g = useStore.getState().settings.google;
      if (g.calendarSync && googleConnected(SCOPES.calendar)) quietly(syncGoogleCalendar).catch(() => {});
      dailyBackups();
    };
    tickReminders();
    tickSync();
    const a = setInterval(tickReminders, 30_000);
    const b = setInterval(tickSync, 15 * 60_000);
    return () => (clearInterval(a), clearInterval(b));
  }, []);
}

export default function App() {
  const s = useStore();
  useTheme();
  useBackground();
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
          <button className="btn ghost" onClick={() => s.setUi({ emailImportOpen: true })} title="Import events from email or Google Calendar"><IMail /> <span className="hide-sm">Import</span></button>
          <button className="btn ghost" onClick={() => s.setUi({ feedbackOpen: true })} title="Suggestions & feedback"><IIdea /> <span className="hide-sm">Feedback</span></button>
        </div>
        <div className="content"><Page /></div>
      </main>
      {s.selectedDay && !s.assistantOpen && <DayPanel />}
      {s.assistantOpen && <AssistantDrawer />}
      {s.feedbackOpen && <FeedbackModal />}
      {s.emailImportOpen && <EmailImport />}
      <CarryOver />
      <UpdatePrompt />
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
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
