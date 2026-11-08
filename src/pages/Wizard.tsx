import { useState, type ReactNode } from "react";
import { toast, useStore } from "../store";
import { restoreBackup } from "../lib/backup";
import { googleConfigured, googleSignInAvailable, restoreFromDrive } from "../lib/google";
import { AssistantSetup, FormatPicker, GoogleSetup, LocationPicker, NewsPicker, RemindersPicker, SyncSetup, ThemePicker } from "../components/SetupParts";
import { FollowPanel } from "./Sports";

interface Step {
  id: string;
  title: string;
  lead: string;
  body: () => ReactNode;
}

export const STEP_NAMES: Record<string, string> = {
  theme: "Theme", location: "Location & weather", format: "Time & calendar", news: "News", sports: "Sports",
  reminders: "Reminders", sync: "Android sync & calling", google: "Google & email", assistant: "Assistant & voice",
};

/**
 * First-run setup. Every step can be skipped on its own, or the whole thing skipped for later.
 * Skipped steps are remembered and offered again from the Home page and Settings.
 * `only` re-opens the wizard on a subset of steps (from the "finish setup" card).
 */
export function Wizard({ only }: { only?: string[] }) {
  const s = useStore();
  const all: Step[] = [
    { id: "welcome", title: "Welcome", lead: "A planner, calendar, task list and assistant that stays in step with your Android phone. A few quick questions; skip anything you like.", body: () => <Welcome /> },
    { id: "theme", title: "Pick a look", lead: "You can change this any time in Settings.", body: () => <ThemePicker /> },
    { id: "location", title: "Where are you?", lead: "Your suburb drives the weather on the home page and local events for each day.", body: () => <LocationPicker /> },
    { id: "format", title: "Time & calendar", lead: "How you like to read times and weeks.", body: () => <FormatPicker /> },
    { id: "news", title: "What news do you want?", lead: "Pick categories and follow topics. Headlines come from Google News.", body: () => <NewsPicker /> },
    { id: "sports", title: "Sports & teams", lead: "Sports appear in the left menu; followed teams show results, highlights and fixtures.", body: () => <FollowPanel /> },
    { id: "reminders", title: "Reminders", lead: "What should I remind you about? Each reminder can also be snoozed or ignored later.", body: () => <RemindersPicker /> },
    { id: "sync", title: "Link your Android phone", lead: "Sync everything both ways and make calls or texts from Windows through your phone.", body: () => <SyncSetup /> },
    { id: "google", title: "Google, email & backup", lead: "Sync Google Calendar, back up to Google Drive, and scan Gmail or Outlook for events.", body: () => <GoogleSetup /> },
    { id: "assistant", title: "Assistant & voice", lead: "Type or talk: \"Dentist Tuesday 3pm\", \"Call Luke\", \"What's on this week?\"", body: () => <AssistantSetup /> },
    { id: "done", title: "All set", lead: "", body: () => <Done /> },
  ];
  const steps = only ? all.filter((x) => only.includes(x.id) || x.id === "done") : all;
  const [i, setI] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const step = steps[i];

  const finish = (extraSkipped: string[] = []) => {
    const done = new Set(steps.map((x) => x.id));
    const skip = [...new Set([...s.settings.setupSkipped.filter((x) => !done.has(x)), ...skipped, ...extraSkipped])].filter((x) => x in STEP_NAMES);
    s.updateSettings((st) => {
      st.onboarded = true;
      st.setupSkipped = skip;
    });
    s.setUi({ toast: null });
  };
  const next = () => (i < steps.length - 1 ? setI(i + 1) : finish());
  const skipStep = () => {
    setSkipped((k) => [...k, step.id]);
    next();
  };
  const skipAll = () => finish(steps.slice(i).map((x) => x.id));

  return (
    <div className="wizard">
      <div className="panel">
        <div className="steps" aria-hidden>{steps.map((x, j) => <i key={x.id} className={j <= i ? "on" : ""} />)}</div>
        <div className="eyebrow">{step.id === "welcome" ? "Setup" : `Step ${i} of ${steps.length - 2}`}</div>
        <h1>{step.title}</h1>
        {step.lead && <p className="muted" style={{ fontSize: 15, marginTop: 0 }}>{step.lead}</p>}
        <div className="card" style={{ margin: "18px 0" }}>{step.body()}</div>
        <div className="row">
          {i > 0 && step.id !== "done" && <button className="btn ghost" onClick={() => setI(i - 1)}>Back</button>}
          {step.id !== "done" && <button className="btn ghost" onClick={skipAll}>Skip setup for now</button>}
          <span style={{ flex: 1 }} />
          {step.id !== "welcome" && step.id !== "done" && <button className="btn" onClick={skipStep}>Skip this step</button>}
          <button className="btn primary" onClick={next}>{step.id === "done" ? "Open my planner" : step.id === "welcome" ? "Get started" : "Next"}</button>
        </div>
        {step.id === "done" && skipped.length > 0 && <p className="muted">Skipped: {skipped.map((x) => STEP_NAMES[x]).join(", ")}. You'll find them on the home page under “Finish setting up”, or in Settings.</p>}
      </div>
    </div>
  );
}

function Welcome() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const restoreFile = async (f: File) => {
    try {
      toast(restoreBackup(await f.text(), { settings: true }));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="stack">
      <label className="field"><span>What should I call you?</span>
        <input className="input" autoFocus value={s.settings.displayName} onChange={(e) => s.updateSettings((st) => void (st.displayName = e.target.value))} placeholder="Your first name" />
      </label>
      <div className="hr" />
      <div className="muted">Already used Calendar Assistant? Restore your data and settings instead of starting fresh:</div>
      <div className="row">
        <label className="btn">Restore from backup file<input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && restoreFile(e.target.files[0])} /></label>
        <button className="btn" hidden={!googleSignInAvailable()} disabled={busy || !googleConfigured()} title={!googleConfigured() ? "Add your Google client ID in the Google step first" : ""} onClick={async () => {
          setBusy(true);
          try {
            const j = await restoreFromDrive();
            toast(j ? restoreBackup(j, { settings: true }) : "No Drive backup found");
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}>Restore from Google Drive</button>
      </div>
    </div>
  );
}

function Done() {
  const s = useStore();
  return (
    <div className="stack">
      <div>Your planner is ready{s.settings.location ? ` with the weather for ${s.settings.location.name}` : ""}.</div>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Press <span className="tag">Ctrl+K</span> or the mic to talk to the assistant.</li>
        <li>Every page has a <b>Customise</b> button; changes are remembered.</li>
        <li>Settings has a search box: type “backup”, “birthday”, “dark”…</li>
      </ul>
    </div>
  );
}
