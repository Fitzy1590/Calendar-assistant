import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PageId } from "../types";
import { toast, useStore } from "../store";
import { exportCsvTasks, exportIcs, exportJsonFile, listSnapshots, restoreBackup, snapshotJson, takeSnapshot } from "../lib/backup";
import {
  AssistantSetup,
  FormatPicker,
  GoogleSetup,
  InviteSetup,
  ShoppingSetup,
  LocalEventsSetup,
  LocationPicker,
  NewsPicker,
  RemindersPicker,
  SyncSetup,
  ThemePicker,
} from "../components/SetupParts";
import { FollowPanel } from "./Sports";
import { UpdateSettings } from "../components/Updates";
import { Diagnostics } from "../components/Errors";
import { ISearch } from "../components/Icons";
import { Field, PageHead, Toggle } from "../components/ui";
import { EmailSetup } from "../components/mail/EmailSetup";
import { DriveSyncSetup } from "../components/DriveSync";

interface Item {
  id: string;
  section: string;
  label: string;
  help?: string;
  keywords: string;
  wide?: boolean;
  render: () => ReactNode;
}

export function Settings() {
  const s = useStore();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: Event) => setQ((e as CustomEvent).detail);
    window.addEventListener("settings-search", h);
    input.current?.focus();
    return () => window.removeEventListener("settings-search", h);
  }, []);

  const items: Item[] = useMemo(
    () => [
      {
        id: "name",
        section: "Profile & look",
        label: "Your name",
        help: "Used in the greeting.",
        keywords: "name profile greeting",
        render: () => (
          <input
            className="input"
            value={s.settings.displayName}
            onChange={(e) => s.updateSettings((st) => void (st.displayName = e.target.value))}
          />
        ),
      },
      {
        id: "theme",
        section: "Profile & look",
        label: "Theme, accent colour, density, text size",
        keywords: "theme dark light mode colour color accent font size density compact appearance",
        wide: true,
        render: () => <ThemePicker />,
      },
      {
        id: "nav",
        section: "Profile & look",
        label: "Left menu",
        help: "Show, hide and reorder pages.",
        keywords: "sidebar menu navigation pages order hide show left pane",
        wide: true,
        render: () => <NavEditor />,
      },
      {
        id: "location",
        section: "Weather & location",
        label: "Home suburb, city and units",
        help: "Drives the weather, local events and the day view.",
        keywords: "location suburb city weather units celsius fahrenheit metric imperial gps",
        wide: true,
        render: () => <LocationPicker />,
      },
      {
        id: "localevents",
        section: "Weather & location",
        label: "Local events",
        keywords: "local events ticketmaster whats on suburb city api key",
        wide: true,
        render: () => <LocalEventsSetup />,
      },
      {
        id: "format",
        section: "Calendar & tasks",
        label: "Clock, week start and default view",
        keywords: "12 24 hour clock time format week start monday sunday calendar view default day week month year",
        wide: true,
        render: () => <FormatPicker />,
      },
      {
        id: "showtasks",
        section: "Calendar & tasks",
        label: "Show tasks on the calendar",
        keywords: "tasks calendar show hide",
        render: () => (
          <Toggle
            checked={s.settings.pages.calendar.showTasks}
            onChange={(v) => s.updateSettings((st) => void (st.pages.calendar.showTasks = v))}
          />
        ),
      },
      {
        id: "reminders",
        section: "Reminders",
        label: "Reminder defaults",
        help: "Turn event, birthday and task reminders on or off.",
        keywords: "reminders notifications alerts birthday events tasks pop-up nag overdue",
        wide: true,
        render: () => <RemindersPicker />,
      },
      {
        id: "news",
        section: "News",
        label: "News categories, topics and edition",
        keywords: "news headlines categories topics google news region country edition",
        wide: true,
        render: () => <NewsPicker />,
      },
      {
        id: "sports",
        section: "Sports",
        label: "Sports and favourite teams",
        keywords: "sports teams football soccer afl nrl cricket nba favourite follow fixtures results highlights",
        wide: true,
        render: () => <FollowPanel />,
      },
      {
        id: "sportskey",
        section: "Sports",
        label: "TheSportsDB API key",
        help: "Optional. Leave blank for the free public key.",
        keywords: "sports api key thesportsdb",
        render: () => (
          <input
            className="input mono"
            value={s.settings.sportsApiKey}
            onChange={(e) => s.updateSettings((st) => void (st.sportsApiKey = e.target.value.trim()))}
          />
        ),
      },
      {
        id: "assistant",
        section: "Assistant & voice",
        label: "Assistant engine, voice and “Hey Planner” wake word",
        keywords:
          "assistant chat bot voice speech microphone claude ai api key language speak wake word hey planner hotword dictation picovoice tray background listen",
        wide: true,
        render: () => <AssistantSetup />,
      },
      {
        id: "invites",
        section: "Invites",
        label: "Invite message and replies",
        help: "The standard message sent when you invite people to an event or catch-up.",
        keywords: "invite invitation rsvp accept message template guests share catch up sms email reply",
        wide: true,
        render: () => <InviteSetup />,
      },
      {
        id: "shopping",
        section: "Shopping",
        label: "Shopping assistant and price tracking",
        keywords: "shopping list price track compare amazon officeworks bunnings stores nearby radius cheap deals drop alert",
        wide: true,
        render: () => <ShoppingSetup />,
      },
      {
        id: "sync",
        section: "Phone & sync",
        label: "Sync with Android and calling",
        keywords: "sync android phone pair pairing code server call sms text phone link devices force sync now share preferences",
        wide: true,
        render: () => <SyncSetup />,
      },
      {
        id: "drive",
        section: "Phone & sync",
        label: "Sync through Google Drive",
        keywords: "google drive sync change file android windows phone periodic auto background stale out of date check no server",
        wide: true,
        render: () => <DriveSyncSetup />,
      },
      {
        id: "mail",
        section: "Email",
        label: "Email accounts, important mail and alerts",
        keywords: "email mail outlook hotmail inbox important junk subscriptions notifications alerts badge summary",
        wide: true,
        render: () => <EmailSetup />,
      },
      {
        id: "google",
        section: "Email, Google & Outlook",
        label: "Google Calendar, Google Drive, Gmail and Outlook",
        keywords: "google calendar sync import gmail outlook microsoft email scan drive backup oauth client id",
        wide: true,
        render: () => <GoogleSetup />,
      },
      {
        id: "backup",
        section: "Backup & restore",
        label: "Backup, import and export",
        help: "Nothing is lost: keep file backups, daily on-device snapshots and an optional Google Drive copy.",
        keywords: "backup restore import export json ics csv snapshot data lost recover google drive",
        wide: true,
        render: () => <BackupPanel />,
      },
      {
        id: "updates",
        section: "Updates",
        label: "App updates",
        help: "Check on launch, install automatically, or check now.",
        keywords: "update upgrade version new release download install force check latest restart",
        wide: true,
        render: () => <UpdateSettings />,
      },
      {
        id: "diagnostics",
        section: "Help & diagnostics",
        label: "System check and problem reports",
        help: "Checks this device has what the app needs, and lists recent errors with a one-click report.",
        keywords:
          "diagnostics system check error crash problem report bug webview2 runtime dependencies microphone notifications storage help troubleshoot",
        wide: true,
        render: () => <Diagnostics />,
      },
      {
        id: "wizard",
        section: "Backup & restore",
        label: "Run the setup wizard again",
        keywords: "setup wizard onboarding first run start again",
        render: () => (
          <button className="btn" onClick={() => s.updateSettings((st) => void (st.onboarded = false))}>
            Open setup wizard
          </button>
        ),
      },
    ],
    [s],
  );

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => terms.every((t) => `${i.section} ${i.label} ${i.help ?? ""} ${i.keywords}`.toLowerCase().includes(t)));
  const sections = [...new Set(shown.map((i) => i.section))];
  const hl = (text: string) => {
    if (!terms.length) return text;
    const alt = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const split = new RegExp(`(${alt})`, "ig");
    const whole = new RegExp(`^(${alt})$`, "i"); // non-global: no lastIndex surprises
    return text.split(split).map((p, i) => (whole.test(p) ? <mark key={i}>{p}</mark> : p));
  };

  return (
    <>
      <PageHead title="Settings" sub="Changes save automatically and sync to your other devices' data." />
      <div className="command" style={{ maxWidth: 520, marginBottom: 20 }}>
        <ISearch />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search settings — try “dark”, “birthday”, “backup”, “google”"
          aria-label="Search settings"
        />
        {q && (
          <button className="btn ghost sm" onClick={() => setQ("")}>
            Clear
          </button>
        )}
      </div>
      <div className="settings">
        <nav>
          {sections.map((sec) => (
            <a key={sec} className="nav-item" href={`#sec-${sec}`} style={{ textDecoration: "none" }}>
              {sec}
            </a>
          ))}
        </nav>
        <div>
          {sections.map((sec) => (
            <section key={sec} id={`sec-${sec}`}>
              <div className="section-title">{hl(sec)}</div>
              {shown
                .filter((i) => i.section === sec)
                .map((i) => (
                  <div key={i.id} className="setting" style={i.wide ? { gridTemplateColumns: "1fr" } : undefined}>
                    <div>
                      <div className="label">{hl(i.label)}</div>
                      {i.help && <div className="help">{hl(i.help)}</div>}
                    </div>
                    <div>{i.render()}</div>
                  </div>
                ))}
            </section>
          ))}
          {!shown.length && <div className="empty">No settings match “{q}”.</div>}
        </div>
      </div>
    </>
  );
}

const NAMES: Record<PageId, string> = {
  home: "Home",
  calendar: "Calendar",
  email: "Email",
  tasks: "Tasks",
  notes: "Notes",
  shopping: "Shopping",
  reminders: "Reminders",
  contacts: "Contacts",
  news: "News",
  sports: "Sports",
  settings: "Settings",
};

function NavEditor() {
  const s = useStore();
  const items = s.settings.sidebar;
  const move = (i: number, d: number) =>
    s.updateSettings((st) => {
      const j = i + d;
      if (j < 0 || j >= st.sidebar.length) return;
      [st.sidebar[i], st.sidebar[j]] = [st.sidebar[j], st.sidebar[i]];
    });
  return (
    <div className="list" style={{ maxWidth: 420 }}>
      {items.map((it, i) => (
        <div key={it.id} className="row" style={{ justifyContent: "space-between" }}>
          <span className="row">
            <Toggle
              checked={it.visible}
              onChange={(v) => s.updateSettings((st) => void (st.sidebar[i].visible = it.id === "settings" ? true : v))}
              label={NAMES[it.id]}
            />{" "}
            {NAMES[it.id]}
          </span>
          <span className="row">
            <button className="btn sm ghost" disabled={i === 0} onClick={() => move(i, -1)}>
              Up
            </button>
            <button className="btn sm ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              Down
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function BackupPanel() {
  const s = useStore();
  const [snaps, setSnaps] = useState(listSnapshots());
  const [withSettings, setWithSettings] = useState(true);
  const importFile = async (f: File) => {
    try {
      toast(restoreBackup(await f.text(), { settings: withSettings }));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="stack">
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Export
        </div>
        <div className="row">
          <button className="btn primary" onClick={exportJsonFile}>
            Full backup (.json)
          </button>
          <button className="btn" onClick={exportIcs}>
            Calendar (.ics)
          </button>
          <button className="btn" onClick={exportCsvTasks}>
            Tasks (.csv)
          </button>
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Import / restore
        </div>
        <div className="row">
          <label className="btn">
            Restore from backup file
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
            />
          </label>
          <button className="btn" onClick={() => s.setUi({ emailImportOpen: true })}>
            Import .ics, email or Google Calendar
          </button>
          <span className="row">
            <Toggle checked={withSettings} onChange={setWithSettings} label="Include settings" /> Also restore settings
          </span>
        </div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>
          Restores merge record by record: anything newer on this device is kept, so restoring never wipes recent changes.
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Snapshots on this device
        </div>
        <span className="row">
          <Toggle
            checked={s.settings.backup.autoLocal}
            onChange={(v) => s.updateSettings((st) => void (st.backup.autoLocal = v))}
            label="Daily snapshots"
          />{" "}
          Keep a daily snapshot (last 14)
          <button className="btn sm" onClick={() => (takeSnapshot(), setSnaps(listSnapshots()), toast("Snapshot saved"))}>
            Snapshot now
          </button>
        </span>
        <div className="list" style={{ marginTop: 6, maxWidth: 520 }}>
          {snaps.map((sn) => (
            <div key={sn.at} className="row" style={{ justifyContent: "space-between" }}>
              <span className="mono" style={{ fontSize: 12.5 }}>
                {format(new Date(sn.at), "EEE d MMM yyyy, h:mm a")} · {Math.round(sn.size / 1024)} KB
              </span>
              <button
                className="btn sm"
                onClick={() => {
                  const j = snapshotJson(sn.at);
                  if (j && confirm("Merge this snapshot back in?")) toast(restoreBackup(j, { settings: false }));
                }}
              >
                Restore
              </button>
            </div>
          ))}
          {!snaps.length && <div className="empty">No snapshots yet.</div>}
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Google Drive
        </div>
        <Field label="">
          <span className="muted">
            Turn on daily Drive backup under Email, Google & Outlook above. Backups go to a hidden app folder in your Drive; API keys are
            never included.
          </span>
        </Field>
      </div>
    </div>
  );
}
