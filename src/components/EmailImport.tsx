import { format } from "date-fns";
import { useMemo, useState } from "react";
import { toast, useStore } from "../store";
import { crossConflicts, extract, parseIcs, scanGmail, scanOutlook, type Candidate } from "../lib/email";
import { localIso } from "../lib/util";
import { importGoogleCalendar } from "../lib/google";
import { Modal } from "./ui";
import { IMail } from "./Icons";

export function EmailImport() {
  const s = useStore();
  const close = () => s.setUi({ emailImportOpen: false });
  const [found, setFound] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [paste, setPaste] = useState("");

  const add = (list: Candidate[]) => {
    const existing = new Set(Object.values(s.events).map((e) => e.title + e.start));
    const fresh = list.filter((c) => !existing.has(c.title + localIso(c.start)));
    setFound((f) => [...f.filter((x) => !fresh.some((n) => n.id === x.id)), ...fresh].sort((a, b) => a.start.getTime() - b.start.getTime()));
    setPicked((p) => new Set([...p, ...fresh.filter((c) => !c.conflicts.length).map((c) => c.id)]));
    if (!fresh.length) setErr("No new upcoming events found.");
  };
  const run = async (label: string, fn: () => Promise<Candidate[]>) => {
    setErr("");
    setBusy(label);
    try {
      add(await fn());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const selected = found.filter((c) => picked.has(c.id));
  const clashes = useMemo(() => crossConflicts(selected), [selected.map((c) => c.id).join()]);
  const withExisting = selected.filter((c) => c.conflicts.length);

  const importNow = () => {
    for (const c of selected)
      s.upsert("events", { title: c.title, start: localIso(c.start), end: localIso(c.end), allDay: c.allDay, location: c.location, source: c.googleId ? "google" : "email", googleId: c.googleId, recurrence: c.recurrence, reminderMins: [s.settings.reminders.defaultEventMins], notes: `Imported from ${c.source}` });
    toast(`Added ${selected.length} event${selected.length === 1 ? "" : "s"}`);
    close();
  };
  const { googleClientId: g, microsoftClientId: m } = s.settings.email;

  return (
    <Modal title="Import events: email & Google Calendar" onClose={close} wide footer={<>
      <span className="muted" style={{ flex: 1 }}>{selected.length} selected</span>
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" disabled={!selected.length} onClick={importNow}>Add to calendar</button>
    </>}>
      <div className="row">
        <button className="btn" disabled={!g || !!busy} onClick={() => run("Gmail", () => scanGmail(g))}><IMail /> Scan Gmail</button>
        <button className="btn" disabled={!m || !!busy} onClick={() => run("Outlook", () => scanOutlook(m))}><IMail /> Scan Outlook / Microsoft 365</button>
        <button className="btn" disabled={!g || !!busy} onClick={() => run("Google Calendar", importGoogleCalendar)}>Import Google Calendar</button>
        <label className="btn">Import .ics file<input type="file" accept=".ics,text/calendar" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) add(parseIcs(await f.text(), f.name));
        }} /></label>
        {busy && <span className="muted">Scanning {busy}…</span>}
      </div>
      {(!g || !m) && <div className="faint" style={{ fontSize: 12.5 }}>To scan a mailbox, add your Google and/or Microsoft client ID in Settings → Email. Mail is read on this device only.</div>}
      <details>
        <summary className="muted" style={{ cursor: "pointer" }}>Or paste an email</summary>
        <textarea className="input" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a booking confirmation or invite…" style={{ marginTop: 8 }} />
        <button className="btn sm" style={{ marginTop: 6 }} onClick={() => add(extract(`paste:${Date.now()}`, paste.split("\n")[0], paste, "Pasted email"))}>Find event</button>
      </details>
      {err && <div className="alert bad">{err}</div>}
      {(withExisting.length > 0 || clashes.length > 0) && (
        <div className="alert">
          <b>Conflicts</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {withExisting.map((c) => <li key={c.id}>"{c.title}" overlaps {c.conflicts.map((o) => `"${o.event.title}"`).join(", ")}</li>)}
            {clashes.map(([a, b]) => <li key={a.id + b.id}>"{a.title}" and "{b.title}" overlap each other</li>)}
          </ul>
        </div>
      )}
      {found.length > 0 && (
        <div className="list">
          <label className="row"><input type="checkbox" checked={selected.length === found.length} onChange={(e) => setPicked(new Set(e.target.checked ? found.map((c) => c.id) : []))} /> <b>Select all</b></label>
          {found.map((c) => (
            <label key={c.id} className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}>
              <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => {
                const n = new Set(picked);
                e.target.checked ? n.add(c.id) : n.delete(c.id);
                setPicked(n);
              }} style={{ marginTop: 4 }} />
              <span style={{ flex: 1 }}>
                <b>{c.title}</b> {c.conflicts.length > 0 && <span className="tag" style={{ color: "var(--warn)" }}>conflict</span>}
                <div className="muted" style={{ fontSize: 12.5 }}>{format(c.start, "EEE d MMM yyyy")}{c.allDay ? " · all day" : ` · ${format(c.start, "h:mm a")}`}{c.location ? ` · ${c.location}` : ""} · {c.source}</div>
                {c.snippet && <div className="faint" style={{ fontSize: 12 }}>{c.snippet}</div>}
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
