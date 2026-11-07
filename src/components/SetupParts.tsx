import { format } from "date-fns";
import { useEffect, useState } from "react";
import type { Place, ThemeName } from "../types";
import { toast, useStore } from "../store";
import { placeFromDevice, searchPlaces } from "../lib/weather";
import { NEWS_REGIONS, NEWS_TOPICS } from "../lib/news";
import { pairingCode } from "../lib/util";
import { backupToDrive, googleConnected, googleToken, restoreFromDrive, SCOPES, syncGoogleCalendar } from "../lib/google";
import { backupJson, restoreBackup } from "../lib/backup";
import { onSyncStatus } from "../lib/sync";
import { IPin } from "./Icons";
import { Field, Toggle } from "./ui";

/** Building blocks shared by the first-run wizard and the Settings page, so both stay in step. */

export const THEMES: { id: ThemeName; name: string; bg: string; fg: string }[] = [
  { id: "system", name: "Match system", bg: "linear-gradient(90deg,#f3efe6 50%,#111113 50%)", fg: "#6b655b" },
  { id: "paper", name: "Paper", bg: "#f3efe6", fg: "#1d1b17" },
  { id: "sand", name: "Sand", bg: "#ece2cf", fg: "#2a2118" },
  { id: "ink", name: "Ink", bg: "#111113", fg: "#ecebe6" },
  { id: "slate", name: "Slate", bg: "#0e151d", fg: "#e3e8ed" },
];
export const ACCENTS = [
  { c: "#b4532a", n: "Terracotta" }, { c: "#4f6b3a", n: "Moss" }, { c: "#2f5d8a", n: "Ink blue" },
  { c: "#b8860b", n: "Ochre" }, { c: "#8a3a55", n: "Mulberry" }, { c: "#50606e", n: "Slate" },
];

export function ThemePicker() {
  const s = useStore();
  return (
    <div className="stack">
      <div className="theme-tiles">
        {THEMES.map((t) => (
          <button key={t.id} className="theme-tile" aria-pressed={s.settings.theme === t.id} onClick={() => s.updateSettings((st) => void (st.theme = t.id))}>
            <div className="sw" style={{ background: t.bg }}><span /><span style={{ margin: 12, borderTop: `3px solid ${s.settings.accent}`, color: t.fg, font: "500 22px var(--font-display)" }}>21°</span></div>
            <div className="nm">{t.name}</div>
          </button>
        ))}
      </div>
      <div className="row">
        <span className="muted" style={{ width: 70 }}>Accent</span>
        {ACCENTS.map((a) => <button key={a.c} className="accent-dot" title={a.n} aria-label={a.n} style={{ background: a.c }} aria-pressed={s.settings.accent === a.c} onClick={() => s.updateSettings((st) => void (st.accent = a.c))} />)}
        <input type="color" value={s.settings.accent} onChange={(e) => s.updateSettings((st) => void (st.accent = e.target.value))} aria-label="Custom accent" style={{ width: 32, height: 28, border: 0, background: "none" }} />
      </div>
      <div className="row">
        <span className="muted" style={{ width: 70 }}>Density</span>
        <div className="seg">{(["comfortable", "compact"] as const).map((d) => <button key={d} aria-pressed={s.settings.density === d} onClick={() => s.updateSettings((st) => void (st.density = d))}>{d}</button>)}</div>
        <span className="muted" style={{ marginLeft: 16 }}>Text size</span>
        <input type="range" min={0.9} max={1.25} step={0.05} value={s.settings.fontScale} onChange={(e) => s.updateSettings((st) => void (st.fontScale = +e.target.value))} />
      </div>
    </div>
  );
}

export function LocationPicker() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Place[]>([]);
  useEffect(() => {
    const t = setTimeout(() => searchPlaces(q).then(setRes).catch(() => setRes([])), 300);
    return () => clearTimeout(t);
  }, [q]);
  const pick = (p: Place) => (s.updateSettings((st) => void (st.location = p)), setRes([]), setQ(""));
  return (
    <div className="stack">
      {s.settings.location && <div className="row"><IPin /> <b>{s.settings.location.name}</b><span className="muted">{[s.settings.location.city, s.settings.location.region, s.settings.location.country].filter(Boolean).join(", ")}</span></div>}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your suburb or town" />
        <button className="btn" onClick={async () => { try { pick(await placeFromDevice()); } catch { toast("Couldn't get your location"); } }}>Use my location</button>
      </div>
      {res.length > 0 && (
        <div className="list card" style={{ padding: "4px 12px" }}>
          {res.map((p) => (
            <button key={`${p.lat},${p.lon}`} className="nav-item" onClick={() => pick(p)}>
              <b>{p.name}</b> <span className="muted">{[p.region, p.country].filter(Boolean).join(", ")}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <span className="muted">Units</span>
        <div className="seg">{(["metric", "imperial"] as const).map((u) => <button key={u} aria-pressed={s.settings.units === u} onClick={() => s.updateSettings((st) => void (st.units = u))}>{u === "metric" ? "°C, km/h" : "°F, mph"}</button>)}</div>
      </div>
    </div>
  );
}

export function FormatPicker() {
  const s = useStore();
  return (
    <div className="row" style={{ gap: 24 }}>
      <span className="row">Clock <div className="seg">{[false, true].map((v) => <button key={String(v)} aria-pressed={s.settings.clock24 === v} onClick={() => s.updateSettings((st) => void (st.clock24 = v))}>{v ? "24-hour" : "12-hour"}</button>)}</div></span>
      <span className="row">Week starts <div className="seg">{([1, 0] as const).map((v) => <button key={v} aria-pressed={s.settings.weekStartsOn === v} onClick={() => s.updateSettings((st) => void (st.weekStartsOn = v))}>{v ? "Monday" : "Sunday"}</button>)}</div></span>
      <span className="row">Calendar opens in <div className="seg">{(["day", "week", "month", "year"] as const).map((v) => <button key={v} aria-pressed={s.settings.pages.calendar.view === v} onClick={() => s.updateSettings((st) => void (st.pages.calendar.view = v))}>{v}</button>)}</div></span>
    </div>
  );
}

export function NewsPicker() {
  const s = useStore();
  const [kw, setKw] = useState("");
  return (
    <div className="stack">
      <div className="row">{NEWS_TOPICS.map((t) => (
        <button key={t.id} className="chip" aria-pressed={s.settings.newsCategories.includes(t.id)} onClick={() => s.updateSettings((st) => {
          st.newsCategories = st.newsCategories.includes(t.id) ? st.newsCategories.filter((c) => c !== t.id) : [...st.newsCategories, t.id];
        })}>{t.label}</button>
      ))}</div>
      <form className="row" onSubmit={(e) => (e.preventDefault(), kw.trim() && s.updateSettings((st) => void (st.newsKeywords = [...new Set([...st.newsKeywords, kw.trim()])])), setKw(""))}>
        <input className="input" style={{ maxWidth: 280 }} value={kw} onChange={(e) => setKw(e.target.value)} placeholder="Follow a topic, e.g. Formula 1, climate" />
        <button className="btn">Add</button>
        {s.settings.newsKeywords.map((k) => <button type="button" key={k} className="chip" aria-pressed onClick={() => s.updateSettings((st) => void (st.newsKeywords = st.newsKeywords.filter((x) => x !== k)))}>{k} ×</button>)}
      </form>
      <label className="row">Edition <select className="input" style={{ width: 180 }} value={s.settings.newsRegion} onChange={(e) => s.updateSettings((st) => void (st.newsRegion = e.target.value))}>{NEWS_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    </div>
  );
}

export function RemindersPicker() {
  const s = useStore();
  const r = s.settings.reminders;
  const set = (p: Partial<typeof r>) => s.updateSettings((st) => void Object.assign(st.reminders, p));
  return (
    <div className="stack">
      <span className="row"><Toggle checked={r.events} onChange={(v) => set({ events: v })} label="Events" /> Remind me about events, by default
        <select className="input" style={{ width: 150 }} value={r.defaultEventMins} onChange={(e) => set({ defaultEventMins: +e.target.value })}>{[5, 10, 15, 30, 60, 120, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m < 1440 ? `${m / 60} hour${m > 60 ? "s" : ""}` : "1 day"} before</option>)}</select>
      </span>
      <span className="row"><Toggle checked={r.birthdays} onChange={(v) => set({ birthdays: v })} label="Birthdays" /> Remind me about birthdays
        <select className="input" style={{ width: 150 }} value={r.birthdayDaysBefore} onChange={(e) => set({ birthdayDaysBefore: +e.target.value })}>{[0, 1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d === 0 ? "on the day" : `${d} days before`}</option>)}</select>
      </span>
      <span className="row"><Toggle checked={r.tasks} onChange={(v) => set({ tasks: v })} label="Tasks" /> Remind me about tasks, and ask about unfinished ones each morning</span>
      <span className="row"><Toggle checked={r.desktopNotifications} onChange={(v) => set({ desktopNotifications: v })} label="Pop-ups" /> Show pop-up notifications</span>
    </div>
  );
}

export function SyncSetup() {
  const s = useStore();
  const sy = s.settings.sync;
  const set = (p: Partial<typeof sy>) => s.updateSettings((st) => void Object.assign(st.sync, p));
  const [status, setStatus] = useState("off");
  const [peers, setPeers] = useState<string[]>([]);
  useEffect(() => {
    const off = onSyncStatus((st, p) => (setStatus(st), setPeers(p)));
    return () => void off();
  }, []);
  return (
    <div className="stack">
      <div className="muted">Run the small sync server (see README) on a PC, Raspberry Pi or VPS, then enter the same server address and pairing code on Windows and Android.</div>
      <div className="grid2">
        <Field label="Sync server address"><input className="input" value={sy.serverUrl} onChange={(e) => set({ serverUrl: e.target.value.trim() })} placeholder="wss://sync.example.com" /></Field>
        <Field label="Pairing code (same on every device)">
          <div className="row" style={{ flexWrap: "nowrap" }}><input className="input mono" value={sy.pairingCode} onChange={(e) => set({ pairingCode: e.target.value.trim() })} /><button className="btn sm" onClick={() => set({ pairingCode: pairingCode() })}>New</button></div>
        </Field>
        <Field label="This device's name"><input className="input" value={sy.deviceName} onChange={(e) => set({ deviceName: e.target.value })} placeholder="e.g. Desk PC, Pixel" /></Field>
        <Field label="Calls and texts from Windows go">
          <select className="input" value={s.settings.phone.route} onChange={(e) => s.updateSettings((st) => void (st.phone.route = e.target.value as "companion"))}>
            <option value="companion">Through this app on my Android phone</option>
            <option value="phonelink">Through Microsoft Phone Link</option>
          </select>
        </Field>
      </div>
      <span className="row"><Toggle checked={sy.enabled} onChange={(v) => set({ enabled: v })} label="Sync on" /> Sync is {sy.enabled ? "on" : "off"} · <span className={"dot " + (status === "online" ? "ok" : status === "offline" ? "bad" : "")} /> {status}{peers.length ? ` · linked: ${peers.join(", ")}` : ""}</span>
    </div>
  );
}

export function GoogleSetup({ compact }: { compact?: boolean }) {
  const s = useStore();
  const g = s.settings.google;
  const e = s.settings.email;
  const [busy, setBusy] = useState("");
  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const m = await fn();
      if (m) toast(m);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy("");
    }
  };
  const restore = () => run("restore", async () => {
    const json = await restoreFromDrive();
    if (!json) return "No backup found in your Google Drive yet.";
    if (!confirm("Merge the Google Drive backup into this device? Newer local changes are kept.")) return;
    return restoreBackup(json, { settings: true });
  });
  return (
    <div className="stack">
      <div className="grid2">
        <Field label="Google OAuth client ID (Web application)"><input className="input mono" value={e.googleClientId} onChange={(ev) => s.updateSettings((st) => void (st.email.googleClientId = ev.target.value.trim()))} placeholder="xxxx.apps.googleusercontent.com" /></Field>
        {!compact && <Field label="Microsoft app (client) ID for Outlook"><input className="input mono" value={e.microsoftClientId} onChange={(ev) => s.updateSettings((st) => void (st.email.microsoftClientId = ev.target.value.trim()))} placeholder="00000000-0000-…" /></Field>}
      </div>
      {!compact && <div className="faint" style={{ fontSize: 12.5 }}>Register <span className="mono">{location.origin}/oauth.html</span> as the redirect URI. Step-by-step in docs/GOOGLE_AND_OUTLOOK.md.</div>}
      <div className="row"><Toggle checked={g.calendarSync} onChange={(v) => s.updateSettings((st) => void (st.google.calendarSync = v))} label="Google Calendar sync" /> Two-way sync with Google Calendar
        <button className="btn sm" disabled={!e.googleClientId || !!busy} onClick={() => run("cal", syncGoogleCalendar)}>{busy === "cal" ? "Syncing…" : "Sync now"}</button>
        {g.lastCalendarSync && <span className="faint" style={{ fontSize: 12 }}>last {format(g.lastCalendarSync, "d MMM h:mm a")}</span>}
      </div>
      <div className="row"><Toggle checked={g.driveBackup} onChange={(v) => s.updateSettings((st) => void (st.google.driveBackup = v))} label="Drive backup" /> Back up data & settings to Google Drive daily
        <button className="btn sm" disabled={!e.googleClientId || !!busy} onClick={() => run("drive", () => backupToDrive(backupJson()))}>Back up now</button>
        <button className="btn sm" disabled={!e.googleClientId || !!busy} onClick={restore}>Restore from Drive</button>
        {g.lastDriveBackup && <span className="faint" style={{ fontSize: 12 }}>last {format(g.lastDriveBackup, "d MMM h:mm a")}</span>}
      </div>
      {e.googleClientId && !googleConnected(SCOPES.calendar) && (g.calendarSync || g.driveBackup) && (
        <div className="row"><button className="btn sm primary" onClick={() => run("connect", async () => void (await googleToken([SCOPES.calendar, SCOPES.drive])))}>Connect Google account</button><span className="faint" style={{ fontSize: 12.5 }}>Automatic sync runs while connected (Google sessions last about an hour).</span></div>
      )}
    </div>
  );
}

export function AssistantSetup() {
  const s = useStore();
  const a = s.settings.assistant;
  const set = (p: Partial<typeof a>) => s.updateSettings((st) => void Object.assign(st.assistant, p));
  return (
    <div className="stack">
      <div className="seg">
        <button aria-pressed={a.provider === "local"} onClick={() => set({ provider: "local" })}>On-device (fast, offline)</button>
        <button aria-pressed={a.provider === "claude"} onClick={() => set({ provider: "claude" })}>Claude (understands anything)</button>
      </div>
      {a.provider === "claude" && (
        <Field label="Anthropic API key (stored only on this device, never in backups)">
          <input className="input mono" type="password" value={a.apiKey} onChange={(e) => set({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" />
        </Field>
      )}
      <div className="row">
        <label className="row">Voice language
          <select className="input" style={{ width: 160 }} value={a.voiceLang} onChange={(e) => set({ voiceLang: e.target.value })}>
            {["en-AU", "en-GB", "en-US", "en-NZ", "en-IE", "en-IN", "en-CA"].map((l) => <option key={l}>{l}</option>)}
          </select>
        </label>
        <span className="row"><Toggle checked={a.speakReplies} onChange={(v) => set({ speakReplies: v })} label="Speak replies" /> Read replies aloud</span>
      </div>
    </div>
  );
}

export function LocalEventsSetup() {
  const s = useStore();
  return (
    <Field label="Ticketmaster Discovery API key (free, optional) for local event listings">
      <input className="input mono" value={s.settings.localEventsApiKey} onChange={(e) => s.updateSettings((st) => void (st.localEventsApiKey = e.target.value.trim()))} placeholder="Leave blank to use search links" />
    </Field>
  );
}
