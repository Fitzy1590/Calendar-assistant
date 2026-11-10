import { format } from "date-fns";
import { useEffect, useState } from "react";
import type { Place, ThemeName } from "../types";
import { toast, useStore } from "../store";
import { placeFromDevice, searchPlaces } from "../lib/weather";
import { NEWS_REGIONS, NEWS_TOPICS } from "../lib/news";
import { pairingCode } from "../lib/util";
import {
  backupToDrive,
  googleConfigured,
  googleConnected,
  googleCalendarOneClick,
  googleDisconnect,
  googleSignInAvailable,
  googleToken,
  restoreFromDrive,
  SCOPES,
  usesLoopback,
} from "../lib/google";
import { backupJson, restoreBackup } from "../lib/backup";
import { forceSync, onSyncStatus } from "../lib/sync";
import { SetupGuideButton } from "./SetupGuide";
import { BUILT_IN_WORDS, browserSpeechAvailable, dictate, useVoice, voiceReady } from "../lib/wake";
import { isAndroid, isTauri, openUrl } from "../lib/platform";
import { IPin } from "./Icons";
import { Field, Suggest, Toggle } from "./ui";
import { cityGuesses, DEVICE_NAMES, KEY_LINKS, NEWS_KEYWORDS, regionDefaults, SYNC_URL_IDEAS } from "../lib/suggest";

/** Building blocks shared by the first-run wizard and the Settings page, so both stay in step. */

export const THEMES: { id: ThemeName; name: string; bg: string; fg: string }[] = [
  { id: "system", name: "Match system", bg: "linear-gradient(90deg,#f3efe6 50%,#111113 50%)", fg: "#6b655b" },
  { id: "paper", name: "Paper", bg: "#f3efe6", fg: "#1d1b17" },
  { id: "sand", name: "Sand", bg: "#ece2cf", fg: "#2a2118" },
  { id: "ink", name: "Ink", bg: "#111113", fg: "#ecebe6" },
  { id: "slate", name: "Slate", bg: "#0e151d", fg: "#e3e8ed" },
  { id: "oled", name: "OLED dark", bg: "#000000", fg: "#f2f2ef" },
  { id: "forest", name: "Forest", bg: "#0f1a14", fg: "#e6efe6" },
  { id: "contrast", name: "High contrast", bg: "#000000", fg: "#ffffff" },
];
export const ACCENTS = [
  { c: "#2f5d8a", n: "Ink blue" },
  { c: "#4f6b3a", n: "Moss" },
  { c: "#b4532a", n: "Terracotta" },
  { c: "#b8860b", n: "Ochre" },
  { c: "#8a3a55", n: "Mulberry" },
  { c: "#50606e", n: "Slate" },
];

export function ThemePicker() {
  const s = useStore();
  return (
    <div className="stack">
      <div className="theme-tiles">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className="theme-tile"
            aria-pressed={s.settings.theme === t.id}
            onClick={() => s.updateSettings((st) => void (st.theme = t.id))}
          >
            <div className="sw" style={{ background: t.bg }}>
              <span />
              <span style={{ margin: 12, borderTop: `3px solid ${s.settings.accent}`, color: t.fg, font: "500 22px var(--font-display)" }}>
                21°
              </span>
            </div>
            <div className="nm">{t.name}</div>
          </button>
        ))}
      </div>
      <div className="row">
        <span className="muted" style={{ width: 70 }}>
          Accent
        </span>
        {ACCENTS.map((a) => (
          <button
            key={a.c}
            className="accent-dot"
            title={a.n}
            aria-label={a.n}
            style={{ background: a.c }}
            aria-pressed={s.settings.accent === a.c}
            onClick={() => s.updateSettings((st) => void (st.accent = a.c))}
          />
        ))}
        <input
          type="color"
          value={s.settings.accent}
          onChange={(e) => s.updateSettings((st) => void (st.accent = e.target.value))}
          aria-label="Custom accent"
          style={{ width: 32, height: 28, border: 0, background: "none" }}
        />
      </div>
      {s.settings.theme === "contrast" && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          High contrast uses its own yellow accent so everything stays easy to see.
        </div>
      )}
      {isTauri() && !isAndroid() && (
        <span className="row">
          <Toggle
            checked={s.settings.fullscreenCoverTaskbar}
            onChange={(v) => s.updateSettings((st) => void (st.fullscreenCoverTaskbar = v))}
            label="Full screen hides the taskbar"
          />{" "}
          Full screen (F11) also hides the Windows taskbar
        </span>
      )}
      <div className="row">
        <span className="muted" style={{ width: 70 }}>
          Density
        </span>
        <div className="seg">
          {(["compact", "comfortable", "spacious"] as const).map((d) => (
            <button key={d} aria-pressed={s.settings.density === d} onClick={() => s.updateSettings((st) => void (st.density = d))}>
              {d}
            </button>
          ))}
        </div>
        <span className="muted" style={{ marginLeft: 16 }}>
          Text size
        </span>
        <input
          type="range"
          min={0.9}
          max={1.25}
          step={0.05}
          value={s.settings.fontScale}
          onChange={(e) => s.updateSettings((st) => void (st.fontScale = +e.target.value))}
        />
      </div>
    </div>
  );
}

export function LocationPicker() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Place[]>([]);
  useEffect(() => {
    const t = setTimeout(
      () =>
        searchPlaces(q)
          .then(setRes)
          .catch(() => setRes([])),
      300,
    );
    return () => clearTimeout(t);
  }, [q]);
  const pick = (p: Place) => (s.updateSettings((st) => void (st.location = p)), setRes([]), setQ(""));
  return (
    <div className="stack">
      {s.settings.location && (
        <div className="row">
          <IPin /> <b>{s.settings.location.name}</b>
          <span className="muted">
            {[s.settings.location.city, s.settings.location.region, s.settings.location.country].filter(Boolean).join(", ")}
          </span>
        </div>
      )}
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your suburb or town" />
        <button
          className="btn"
          onClick={async () => {
            try {
              pick(await placeFromDevice());
            } catch {
              toast("Couldn't get your location");
            }
          }}
        >
          Use my location
        </button>
      </div>
      {!q && !s.settings.location && (
        <Suggest
          label="Near you"
          items={cityGuesses(Intl.DateTimeFormat().resolvedOptions().timeZone).map((c) => ({ label: c, onUse: () => setQ(c) }))}
        />
      )}
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
        <div className="seg">
          {(["metric", "imperial"] as const).map((u) => (
            <button key={u} aria-pressed={s.settings.units === u} onClick={() => s.updateSettings((st) => void (st.units = u))}>
              {u === "metric" ? "°C, km/h" : "°F, mph"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormatPicker() {
  const s = useStore();
  return (
    <div className="row" style={{ gap: 24 }}>
      <span className="row">
        Clock{" "}
        <div className="seg">
          {[false, true].map((v) => (
            <button key={String(v)} aria-pressed={s.settings.clock24 === v} onClick={() => s.updateSettings((st) => void (st.clock24 = v))}>
              {v ? "24-hour" : "12-hour"}
            </button>
          ))}
        </div>
      </span>
      <span className="row">
        Week starts{" "}
        <div className="seg">
          {([1, 0] as const).map((v) => (
            <button
              key={v}
              aria-pressed={s.settings.weekStartsOn === v}
              onClick={() => s.updateSettings((st) => void (st.weekStartsOn = v))}
            >
              {v ? "Monday" : "Sunday"}
            </button>
          ))}
        </div>
      </span>
      <RegionSuggestion />
      <span className="row">
        Calendar opens in{" "}
        <div className="seg">
          {(["day", "week", "month", "year"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={s.settings.pages.calendar.view === v}
              onClick={() => s.updateSettings((st) => void (st.pages.calendar.view = v))}
            >
              {v}
            </button>
          ))}
        </div>
      </span>
    </div>
  );
}

export function NewsPicker() {
  const s = useStore();
  const [kw, setKw] = useState("");
  return (
    <div className="stack">
      <div className="row">
        {NEWS_TOPICS.map((t) => (
          <button
            key={t.id}
            className="chip"
            aria-pressed={s.settings.newsCategories.includes(t.id)}
            onClick={() =>
              s.updateSettings((st) => {
                st.newsCategories = st.newsCategories.includes(t.id)
                  ? st.newsCategories.filter((c) => c !== t.id)
                  : [...st.newsCategories, t.id];
              })
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => (
          e.preventDefault(),
          kw.trim() && s.updateSettings((st) => void (st.newsKeywords = [...new Set([...st.newsKeywords, kw.trim()])])),
          setKw("")
        )}
      >
        <input
          className="input"
          style={{ maxWidth: 280 }}
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="Follow a topic, e.g. Formula 1, climate"
        />
        <button className="btn">Add</button>
        <Suggest
          items={NEWS_KEYWORDS.filter((k) => !s.settings.newsKeywords.includes(k))
            .slice(0, 6)
            .map((k) => ({
              label: k,
              onUse: () => s.updateSettings((st) => void (st.newsKeywords = [...new Set([...st.newsKeywords, k])])),
            }))}
        />
        {s.settings.newsKeywords.map((k) => (
          <button
            type="button"
            key={k}
            className="chip"
            aria-pressed
            onClick={() => s.updateSettings((st) => void (st.newsKeywords = st.newsKeywords.filter((x) => x !== k)))}
          >
            {k} ×
          </button>
        ))}
      </form>
      <label className="row">
        Edition{" "}
        <select
          className="input"
          style={{ width: 180 }}
          value={s.settings.newsRegion}
          onChange={(e) => s.updateSettings((st) => void (st.newsRegion = e.target.value))}
        >
          {NEWS_REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function RemindersPicker() {
  const s = useStore();
  const r = s.settings.reminders;
  const set = (p: Partial<typeof r>) => s.updateSettings((st) => void Object.assign(st.reminders, p));
  return (
    <div className="stack">
      <span className="row">
        <Toggle checked={r.events} onChange={(v) => set({ events: v })} label="Events" /> Remind me about events, by default
        <select
          className="input"
          style={{ width: 150 }}
          value={r.defaultEventMins}
          onChange={(e) => set({ defaultEventMins: +e.target.value })}
        >
          {[5, 10, 15, 30, 60, 120, 1440].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : m < 1440 ? `${m / 60} hour${m > 60 ? "s" : ""}` : "1 day"} before
            </option>
          ))}
        </select>
      </span>
      <span className="row">
        <Toggle checked={r.birthdays} onChange={(v) => set({ birthdays: v })} label="Birthdays" /> Remind me about birthdays
        <select
          className="input"
          style={{ width: 150 }}
          value={r.birthdayDaysBefore}
          onChange={(e) => set({ birthdayDaysBefore: +e.target.value })}
        >
          {[0, 1, 2, 3, 5, 7, 14].map((d) => (
            <option key={d} value={d}>
              {d === 0 ? "on the day" : `${d} days before`}
            </option>
          ))}
        </select>
      </span>
      <span className="row">
        <Toggle checked={r.tasks} onChange={(v) => set({ tasks: v })} label="Tasks" /> Remind me about tasks, and ask about unfinished ones
        each morning
      </span>
      <span className="row">
        <Toggle checked={r.desktopNotifications} onChange={(v) => set({ desktopNotifications: v })} label="Pop-ups" /> Show pop-up
        notifications
      </span>
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
      <div className="muted">
        Run the small sync server (see README) on a PC, Raspberry Pi or VPS, then enter the same server address and pairing code on Windows
        and Android.
      </div>
      <div className="grid2">
        <Field label="Sync server address">
          <input
            className="input"
            value={sy.serverUrl}
            onChange={(e) => set({ serverUrl: e.target.value.trim() })}
            placeholder="wss://sync.example.com"
          />
          {!sy.serverUrl && (
            <Suggest items={SYNC_URL_IDEAS.map((i) => ({ label: i.label, title: i.value, onUse: () => set({ serverUrl: i.value }) }))} />
          )}
        </Field>
        <Field label="Pairing code (same on every device)">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input mono" value={sy.pairingCode} onChange={(e) => set({ pairingCode: e.target.value.trim() })} />
            <button className="btn sm" onClick={() => set({ pairingCode: pairingCode() })}>
              New
            </button>
          </div>
        </Field>
        <Field label="This device's name">
          <input
            className="input"
            value={sy.deviceName}
            onChange={(e) => set({ deviceName: e.target.value })}
            placeholder="e.g. Desk PC, Pixel"
          />
          {!sy.deviceName && (
            <Suggest
              items={(isAndroid() ? DEVICE_NAMES.android : DEVICE_NAMES.windows).map((n) => ({
                label: n,
                onUse: () => set({ deviceName: n }),
              }))}
            />
          )}
        </Field>
        <Field label="Calls and texts from Windows go">
          <select
            className="input"
            value={s.settings.phone.route}
            onChange={(e) => s.updateSettings((st) => void (st.phone.route = e.target.value as "companion"))}
          >
            <option value="companion">Through this app on my Android phone</option>
            <option value="phonelink">Through Microsoft Phone Link</option>
          </select>
        </Field>
      </div>
      <span className="row">
        <Toggle checked={sy.enabled} onChange={(v) => set({ enabled: v })} label="Sync on" /> Sync is {sy.enabled ? "on" : "off"} ·{" "}
        <span className={"dot " + (status === "online" ? "ok" : status === "offline" ? "bad" : "")} /> {status}
        {peers.length ? ` · linked: ${peers.join(", ")}` : ""}
        {sy.enabled && (
          <button className="btn sm" onClick={() => (forceSync(), toast("Syncing everything…"))}>
            Sync now
          </button>
        )}
      </span>
      <span className="row">
        <Toggle checked={sy.shareSettings} onChange={(v) => set({ shareSettings: v })} label="Share preferences" /> Keep news, sports,
        reminders, invite and shopping preferences the same on all devices
      </span>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Everything you add or change (events, tasks, notes, contacts, shopping) syncs automatically within a second while both apps are
        open, and catches up as soon as an app reopens. Theme and layout stay per device.
      </div>
    </div>
  );
}

export function GoogleSetup({ compact }: { compact?: boolean }) {
  const s = useStore();
  const g = s.settings.google;
  const e = s.settings.email;
  const [busy, setBusy] = useState("");
  const [, bump] = useState(0);
  const setEmail = (p: Partial<typeof e>) => s.updateSettings((st) => void Object.assign(st.email, p));
  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const m = await fn();
      if (m) toast(m);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy("");
      bump((n) => n + 1);
    }
  };
  const restore = () =>
    run("restore", async () => {
      const json = await restoreFromDrive();
      if (!json) return "No backup found in your Google Drive yet.";
      return restoreBackup(json, { settings: true });
    });
  if (!googleSignInAvailable()) {
    return (
      <div className="stack">
        <div className="muted">
          Google Calendar sync, Drive backup and Gmail scanning run from the Windows app. Anything they add reaches this phone through sync,
          so there's nothing to sign in to here. (Drive sync on this phone is under Settings → Phone & sync.)
        </div>
        <SetupGuideButton kind="google" label="Step-by-step Google setup guide" />
        {!compact && (
          <div className="faint" style={{ fontSize: 12.5 }}>
            Microsoft Outlook client ID (optional, for scanning on this phone)
            <input
              className="input mono"
              value={e.microsoftClientId}
              onChange={(ev) => setEmail({ microsoftClientId: ev.target.value.trim() })}
            />
          </div>
        )}
      </div>
    );
  }
  const ready = googleConfigured();
  const connected = googleConnected(SCOPES.calendar) || googleConnected(SCOPES.drive);
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <SetupGuideButton kind="google" label="Step-by-step Google setup guide" />
        <span className="faint" style={{ fontSize: 12.5 }}>
          New to this? It walks you through it, with buttons that open the right Google pages.
        </span>
      </div>
      {usesLoopback() ? (
        <div className="grid2">
          <Field label="Google client ID (Desktop app)">
            <input
              className="input mono"
              value={e.googleDesktopClientId}
              onChange={(ev) => setEmail({ googleDesktopClientId: ev.target.value.trim() })}
              placeholder="xxxx.apps.googleusercontent.com"
            />
          </Field>
          <Field label="Google client secret (Desktop app)">
            <input
              className="input mono"
              type="password"
              value={e.googleDesktopClientSecret}
              onChange={(ev) => setEmail({ googleDesktopClientSecret: ev.target.value.trim() })}
              placeholder="GOCSPX-…"
            />
          </Field>
        </div>
      ) : (
        <Field label="Google OAuth client ID (Web application)">
          <input
            className="input mono"
            value={e.googleClientId}
            onChange={(ev) => setEmail({ googleClientId: ev.target.value.trim() })}
            placeholder="xxxx.apps.googleusercontent.com"
          />
        </Field>
      )}
      {!compact && (
        <Field label="Microsoft app (client) ID for Outlook">
          <input
            className="input mono"
            value={e.microsoftClientId}
            onChange={(ev) => setEmail({ microsoftClientId: ev.target.value.trim() })}
            placeholder="00000000-0000-…"
          />
        </Field>
      )}
      {!compact && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          {usesLoopback() ? (
            "Create a “Desktop app” OAuth client in Google Cloud. Sign-in opens your browser and returns to the app automatically; you stay signed in."
          ) : (
            <>
              Register <span className="mono">{location.origin}/oauth.html</span> as the redirect URI.
            </>
          )}{" "}
          Use the step-by-step guide above if you get stuck.
        </div>
      )}
      <div className="row">
        <span className={"dot " + (connected ? "ok" : "")} /> {connected ? "Google account connected" : "Not connected"}
        {!connected && (
          <button
            className="btn sm primary"
            disabled={!ready || !!busy}
            onClick={() => run("connect", async () => void (await googleToken([SCOPES.calendar, SCOPES.drive])))}
          >
            {busy === "connect" ? "Waiting for browser…" : "Connect Google account"}
          </button>
        )}
        {connected && (
          <button className="btn sm ghost" onClick={() => (googleDisconnect(), bump((n) => n + 1), toast("Disconnected from Google"))}>
            Disconnect
          </button>
        )}
      </div>
      <div className="row">
        <button className="btn primary" disabled={!ready || !!busy} onClick={() => run("cal", googleCalendarOneClick)}>
          {busy === "cal" ? "Syncing…" : googleConnected(SCOPES.calendar) ? "Sync with Google Calendar" : "Connect & sync Google Calendar"}
        </button>
        {g.lastCalendarSyncAt && (
          <span className="faint" style={{ fontSize: 12 }}>
            last synced {format(g.lastCalendarSyncAt, "d MMM h:mm a")}
          </span>
        )}
      </div>
      {!ready && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          Add your Google client ID above first, then this button signs in and syncs in one step.
        </div>
      )}
      <div className="row">
        <Toggle
          checked={g.calendarSync}
          onChange={(v) => s.updateSettings((st) => void (st.google.calendarSync = v))}
          label="Automatic Google Calendar sync"
        />{" "}
        Sync automatically, two ways, every
        <select
          className="input"
          style={{ width: "auto" }}
          aria-label="How often to sync with Google Calendar"
          disabled={!g.calendarSync}
          value={g.syncEveryMins > 0 ? g.syncEveryMins : 15}
          onChange={(ev) => s.updateSettings((st) => void (st.google.syncEveryMins = Number(ev.target.value)))}
        >
          {[5, 15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {m === 60 ? "hour" : `${m} minutes`}
            </option>
          ))}
        </select>
        and whenever the app opens
      </div>
      {g.lastCalendarSyncError && (
        <div role="alert" style={{ fontSize: 12.5, color: "var(--bad)" }}>
          Last sync stopped: {g.lastCalendarSyncError}
        </div>
      )}
      <div className="row">
        <Toggle checked={g.driveBackup} onChange={(v) => s.updateSettings((st) => void (st.google.driveBackup = v))} label="Drive backup" />{" "}
        Back up data & settings to Google Drive daily
        <button className="btn sm" disabled={!ready || !!busy} onClick={() => run("drive", () => backupToDrive(backupJson()))}>
          Back up now
        </button>
        <button className="btn sm" disabled={!ready || !!busy} onClick={restore}>
          Restore from Drive
        </button>
        {g.lastDriveBackup && (
          <span className="faint" style={{ fontSize: 12 }}>
            last {format(g.lastDriveBackup, "d MMM h:mm a")}
          </span>
        )}
      </div>
      {!usesLoopback() && connected && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          In the browser, Google sessions last about an hour; the Windows app stays signed in.
        </div>
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
        <button aria-pressed={a.provider === "local"} onClick={() => set({ provider: "local" })}>
          On-device (fast, offline)
        </button>
        <button aria-pressed={a.provider === "claude"} onClick={() => set({ provider: "claude" })}>
          Claude (understands anything)
        </button>
      </div>
      {a.provider === "claude" && (
        <Field label="Anthropic API key (stored only on this device, never in backups)">
          <input
            className="input mono"
            type="password"
            value={a.apiKey}
            onChange={(e) => set({ apiKey: e.target.value.trim() })}
            placeholder="sk-ant-…"
          />
          <Suggest
            label="Where to get it"
            items={[{ label: KEY_LINKS.anthropic.label, onUse: () => void openUrl(KEY_LINKS.anthropic.url) }]}
          />
        </Field>
      )}
      <div className="row">
        <label className="row">
          Voice language
          <select className="input" style={{ width: 160 }} value={a.voiceLang} onChange={(e) => set({ voiceLang: e.target.value })}>
            {["en-AU", "en-GB", "en-US", "en-NZ", "en-IE", "en-IN", "en-CA"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <span className="row">
          <Toggle checked={a.speakReplies} onChange={(v) => set({ speakReplies: v })} label="Speak replies" /> Read replies aloud
        </span>
      </div>
      <div className="hr" />
      <WakeWordSetup />
    </div>
  );
}

export function WakeWordSetup() {
  const s = useStore();
  const v = s.settings.voice;
  const { status, error } = useVoice();
  const set = (p: Partial<typeof v>) => s.updateSettings((st) => void Object.assign(st.voice, p));
  const [heard, setHeard] = useState("");
  const loadPpn = async (f: File) => {
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    set({
      customKeyword: {
        label:
          f.name
            .replace(/_[a-z]{2}_wasm.*$/i, "")
            .replace(/[-_]/g, " ")
            .replace(/\.ppn$/i, "") || "Hey Planner",
        base64: btoa(bin),
      },
      keyword: "custom",
    });
    toast("Wake word model added");
  };
  const desktop = isTauri() && !isAndroid();
  return (
    <div className="stack">
      <span className="row">
        <Toggle checked={v.wakeWord} onChange={(x) => set({ wakeWord: x })} label="Wake word" /> <b>Listen for “Hey Planner”</b> while the
        app is open
        <span className="faint" style={{ fontSize: 12.5 }}>
          ·{" "}
          {status === "waiting"
            ? "listening"
            : status === "loading"
              ? "loading voice models…"
              : status === "error"
                ? error
                : status === "dictating"
                  ? "taking dictation"
                  : "off"}
        </span>
      </span>
      <div className="seg">
        <button aria-pressed={v.engine === "picovoice"} onClick={() => set({ engine: "picovoice" })}>
          On-device (Picovoice)
        </button>
        <button
          aria-pressed={v.engine === "browser"}
          onClick={() => set({ engine: "browser" })}
          disabled={!browserSpeechAvailable()}
          title={browserSpeechAvailable() ? "" : "Only in Chrome or Edge browser windows"}
        >
          Browser speech
        </button>
      </div>
      {v.engine === "picovoice" && (
        <>
          <Field label="Picovoice AccessKey (free for personal use at console.picovoice.ai; stays on this device)">
            <input
              className="input mono"
              type="password"
              value={v.picovoiceKey}
              onChange={(e) => set({ picovoiceKey: e.target.value.trim() })}
              placeholder="Paste your AccessKey"
            />
            <Suggest
              label="Where to get it"
              items={[{ label: KEY_LINKS.picovoice.label, onUse: () => void openUrl(KEY_LINKS.picovoice.url) }]}
            />
          </Field>
          <div className="grid2">
            <Field label="Wake word">
              <select className="input" value={v.keyword} onChange={(e) => set({ keyword: e.target.value })}>
                <option value="custom">
                  {v.customKeyword
                    ? `${v.customKeyword.label} (your model)`
                    : "Hey Planner (add your model below; uses “Computer” until then)"}
                </option>
                {BUILT_IN_WORDS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Sensitivity ${Math.round(v.sensitivity * 100)}% (higher hears you more easily, with more false starts)`}>
              <input
                type="range"
                min={0.3}
                max={0.9}
                step={0.05}
                value={v.sensitivity}
                onChange={(e) => set({ sensitivity: +e.target.value })}
              />
            </Field>
          </div>
          <div className="row">
            <label className="btn sm">
              {v.customKeyword ? "Replace" : "Add"} “Hey Planner” model (.ppn)
              <input type="file" accept=".ppn" hidden onChange={(e) => e.target.files?.[0] && loadPpn(e.target.files[0])} />
            </label>
            <span className="faint" style={{ fontSize: 12.5 }}>
              In Picovoice Console → Porcupine, type “Hey Planner”, choose <b>Web (WASM)</b>, download, and add the file here.
            </span>
          </div>
        </>
      )}
      <div className="row">
        <span className="row">
          <Toggle checked={v.chime} onChange={(x) => set({ chime: x })} label="Chime" /> Chime when listening starts and stops
        </span>
        {desktop && (
          <span className="row">
            <Toggle checked={v.closeToTray} onChange={(x) => set({ closeToTray: x })} label="Tray" /> Keep running in the tray when the
            window is closed
          </span>
        )}
      </div>
      <div className="row">
        <button
          className="btn sm"
          disabled={!voiceReady() || status === "dictating"}
          onClick={() => dictate(setHeard, (t) => setHeard(t || "(didn't catch anything)"))}
        >
          Test dictation
        </button>
        {heard && <span className="muted">Heard: “{heard}”</span>}
      </div>
      <div className="faint" style={{ fontSize: 12.5 }}>
        {isAndroid()
          ? "On Android the wake word works while the app is on screen; Android pauses the microphone for apps in the background."
          : "Audio is processed on this device; nothing is sent anywhere while it waits for the wake word."}
      </div>
    </div>
  );
}

export function LocalEventsSetup() {
  const s = useStore();
  return (
    <Field label="Ticketmaster Discovery API key (free, optional) for local event listings">
      <input
        className="input mono"
        value={s.settings.localEventsApiKey}
        onChange={(e) => s.updateSettings((st) => void (st.localEventsApiKey = e.target.value.trim()))}
        placeholder="Leave blank to use search links"
      />
      <Suggest
        label="Where to get it"
        items={[{ label: KEY_LINKS.ticketmaster.label, onUse: () => void openUrl(KEY_LINKS.ticketmaster.url) }]}
      />
    </Field>
  );
}

export function InviteSetup() {
  const s = useStore();
  const v = s.settings.invites;
  const set = (p: Partial<typeof v>) => s.updateSettings((st) => void Object.assign(st.invites, p));
  return (
    <div className="stack">
      <Field label="Your standard invite message">
        <textarea className="input" rows={4} value={v.template} onChange={(e) => set({ template: e.target.value })} />
      </Field>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Fill-ins: {"{name}"} first name · {"{title}"} · {"{when}"} · {"{where}"} · {"{maps}"} map link · {"{rsvp}"} accept link · {"{from}"}{" "}
        your name
      </div>
      <div className="row" style={{ gap: 20 }}>
        <label className="row">
          Send invites by
          <select
            className="input"
            style={{ width: 170 }}
            value={v.channel}
            onChange={(e) => set({ channel: e.target.value as typeof v.channel })}
          >
            <option value="ask">Ask each time</option>
            <option value="sms">Text when possible</option>
            <option value="email">Email when possible</option>
          </select>
        </label>
        <span className="row">
          <Toggle checked={v.rsvpLinks} onChange={(x) => set({ rsvpLinks: x })} label="Accept links" /> Include an Accept link
        </span>
        <span className="row">
          <Toggle checked={v.notifyReplies} onChange={(x) => set({ notifyReplies: x })} label="Reply alerts" /> Tell me when people reply
        </span>
      </div>
    </div>
  );
}

export function ShoppingSetup() {
  const s = useStore();
  const v = s.settings.shopping;
  const set = (p: Partial<typeof v>) => s.updateSettings((st) => void Object.assign(st.shopping, p));
  const all = ["Amazon AU", "Officeworks", "Bunnings", "eBay AU", "JB Hi-Fi", "Kmart", "Big W", "Woolworths", "Coles"];
  return (
    <div className="stack">
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Online stores to compare
        </div>
        <div className="row">
          {all.map((n) => (
            <button
              key={n}
              className="chip"
              aria-pressed={v.onlineStores.includes(n)}
              onClick={() =>
                set({ onlineStores: v.onlineStores.includes(n) ? v.onlineStores.filter((x) => x !== n) : [...v.onlineStores, n] })
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ gap: 20 }}>
        <label className="row">
          Search within
          <select className="input" style={{ width: 100 }} value={v.radiusKm} onChange={(e) => set({ radiusKm: +e.target.value })}>
            {[2, 5, 10, 20, 40].map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
        <span className="row">
          <Toggle checked={v.checkPricesDaily} onChange={(x) => set({ checkPricesDaily: x })} label="Daily checks" /> Check tracked prices
          daily
        </span>
        <span className="row">
          <Toggle checked={v.notifyDrops} onChange={(x) => set({ notifyDrops: x })} label="Drop alerts" /> Tell me when a price drops
        </span>
      </div>
      <div className="faint" style={{ fontSize: 12.5 }}>
        Live price comparison uses Claude (Settings → Assistant & voice). Nearby stores come from OpenStreetMap and work without it.
      </div>
    </div>
  );
}

/** "Suggested for your region" when the clock or week start differs from what this region usually uses. */
function RegionSuggestion() {
  const s = useStore();
  const want = regionDefaults(navigator.language || "en-AU");
  if (s.settings.clock24 === want.clock24 && s.settings.weekStartsOn === want.weekStartsOn) return null;
  const text = `${want.weekStartsOn ? "Monday" : "Sunday"} week start, ${want.clock24 ? "24-hour" : "12-hour"} clock`;
  return (
    <Suggest
      label="Suggested for your region"
      items={[
        {
          label: `Use ${text}`,
          onUse: () =>
            s.updateSettings((st) => {
              st.clock24 = want.clock24;
              st.weekStartsOn = want.weekStartsOn;
            }),
        },
      ]}
    />
  );
}
