import { format } from "date-fns";
import { DEFAULT_SETTINGS, live, useStore, type Change } from "../store";
import type { CollectionName, Settings } from "../types";
import { fromYmd } from "./util";
import { backupToDrive, googleConnected, quietly, SCOPES } from "./google";

/**
 * Backups so nothing is ever lost:
 *  - export/import a full JSON backup (data + settings) as a file;
 *  - rolling daily snapshots kept on this device (last 14);
 *  - optional Google Drive copy (see google.ts);
 *  - calendar export as .ics for any other calendar app.
 * Import merges record-by-record (newest wins) so restoring never wipes newer changes.
 */

const COLLECTIONS: CollectionName[] = ["events", "tasks", "contacts", "notes", "feedback"];
const SNAP_KEY = "snapshots";

export interface Backup {
  app: "calendar-assistant";
  version: 1;
  createdAt: string;
  settings: Settings;
  data: Record<CollectionName, unknown[]>;
}

export function makeBackup(): Backup {
  const s = useStore.getState();
  return {
    app: "calendar-assistant",
    version: 1,
    createdAt: new Date().toISOString(),
    // secrets stay on the device: API keys are not written into backups
    settings: {
      ...s.settings,
      assistant: { ...s.settings.assistant, apiKey: "" },
      voice: { ...s.settings.voice, picovoiceKey: "" },
      email: { ...s.settings.email, googleDesktopClientSecret: "" },
    },
    data: Object.fromEntries(COLLECTIONS.map((c) => [c, Object.values(s[c])])) as Backup["data"],
  };
}

export function backupJson() {
  return JSON.stringify(makeBackup());
}

export function restoreBackup(json: string, opts: { settings: boolean }): string {
  const b = JSON.parse(json) as Backup;
  if (b.app !== "calendar-assistant") throw new Error("That file isn't a Calendar Assistant backup.");
  const changes: Change[] = COLLECTIONS.flatMap((c) => ((b.data[c] ?? []) as Change["record"][]).map((record) => ({ collection: c, record })));
  const st = useStore.getState();
  st.applyRemote(changes);
  if (opts.settings && b.settings) {
    const keep = st.settings;
    st.updateSettings(() => ({
      ...DEFAULT_SETTINGS,
      ...b.settings,
      onboarded: true,
      assistant: { ...b.settings.assistant, apiKey: keep.assistant.apiKey },
      voice: { ...DEFAULT_SETTINGS.voice, ...b.settings.voice, picovoiceKey: keep.voice.picovoiceKey },
      email: { ...DEFAULT_SETTINGS.email, ...b.settings.email, googleDesktopClientSecret: keep.email.googleDesktopClientSecret },
      sync: { ...b.settings.sync, deviceName: keep.sync.deviceName },
    }));
  }
  return `Restored ${changes.length} records from ${format(new Date(b.createdAt), "d MMM yyyy, h:mm a")}.`;
}

export function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJsonFile() {
  download(`calendar-assistant-backup-${format(new Date(), "yyyy-MM-dd")}.json`, JSON.stringify(makeBackup(), null, 1));
}

export function exportIcs() {
  const s = useStore.getState();
  const dt = (iso: string, allDay: boolean) =>
    allDay ? `;VALUE=DATE:${iso.slice(0, 10).replace(/-/g, "")}` : `:${format(fromYmd(iso), "yyyyMMdd'T'HHmmss")}`;
  const esc = (v = "") => v.replace(/[\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calendar Assistant//EN"];
  for (const e of live(s.events)) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@calendar-assistant`, `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss")}`,
      `DTSTART${dt(e.start, e.allDay)}`, `DTEND${dt(e.end, e.allDay)}`, `SUMMARY:${esc(e.title)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    if (e.recurrence) {
      const r = e.recurrence;
      lines.push(`RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval}${r.byWeekday?.length ? ";BYDAY=" + r.byWeekday.map((d) => days[d]).join(",") : ""}${r.until ? ";UNTIL=" + r.until.replace(/-/g, "") : ""}${r.count ? ";COUNT=" + r.count : ""}`);
      for (const x of e.exceptions ?? []) lines.push(`EXDATE${dt(x + e.start.slice(10), e.allDay)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  download(`calendar-${format(new Date(), "yyyy-MM-dd")}.ics`, lines.join("\r\n"), "text/calendar");
}

export function exportCsvTasks() {
  const rows = [["title", "due", "time", "priority", "done", "notes"], ...live(useStore.getState().tasks).map((t) => [t.title, t.due ?? "", t.time ?? "", t.priority, String(t.done), t.notes ?? ""])];
  download(`tasks-${format(new Date(), "yyyy-MM-dd")}.csv`, rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
}

/* ---- rolling local snapshots ---- */

export function listSnapshots(): { at: string; size: number }[] {
  try {
    return (JSON.parse(localStorage.getItem(SNAP_KEY) || "[]") as { at: string; json: string }[]).map((s) => ({ at: s.at, size: s.json.length }));
  } catch {
    return [];
  }
}

export function snapshotJson(at: string) {
  const all = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]") as { at: string; json: string }[];
  return all.find((s) => s.at === at)?.json;
}

export function takeSnapshot() {
  try {
    const all = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]") as { at: string; json: string }[];
    all.unshift({ at: new Date().toISOString(), json: backupJson() });
    localStorage.setItem(SNAP_KEY, JSON.stringify(all.slice(0, 14)));
    useStore.getState().updateSettings((s) => void (s.backup.lastLocal = Date.now()));
  } catch {
    /* storage full: the file export is still available */
  }
}

/** Daily: local snapshot and, if enabled and signed in, Drive backup. */
export async function dailyBackups() {
  const s = useStore.getState().settings;
  const day = 20 * 3600e3;
  if (s.backup.autoLocal && Date.now() - (s.backup.lastLocal ?? 0) > day) takeSnapshot();
  if (s.google.driveBackup && Date.now() - (s.google.lastDriveBackup ?? 0) > day) {
    if (googleConnected(SCOPES.drive)) await quietly(() => backupToDrive(backupJson())).catch(() => {});
  }
}
