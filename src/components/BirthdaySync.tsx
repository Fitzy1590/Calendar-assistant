import { format } from "date-fns";
import { useState } from "react";
import { toast, useStore } from "../store";
import { birthdayStats } from "../lib/birthdays";
import { nextBirthday } from "../lib/reminders";
import { googleConfigured, googleSignInAvailable, syncGoogleContacts } from "../lib/google";
import { live } from "../store";
import { Modal } from "./ui";

/**
 * "Sync birthdays": birthdays are drawn from Contacts, so one is missing only when the contact has no
 * date. This shows the count on the calendar, lets you fill in missing dates inline, and pulls dates
 * from Google Contacts or a phone contacts export.
 */
export function BirthdaySync({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const { withBirthday, without } = birthdayStats();
  const upcoming = live(s.contacts)
    .filter((c) => c.birthday)
    .map((c) => ({ c, ...nextBirthday(c.birthday!) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 6);
  const missing = without.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 40);

  const fromGoogle = async () => {
    setBusy(true);
    try {
      toast(await syncGoogleContacts());
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const importVcf = async (file: File) => {
    const text = await file.text();
    let n = 0;
    const contacts = live(useStore.getState().contacts);
    for (const card of text.split("BEGIN:VCARD").slice(1)) {
      const get = (k: string) => card.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "m"))?.[1]?.trim();
      const name = get("FN");
      const raw = get("BDAY");
      if (!name || !raw) continue;
      const b = raw.replace(/^--/, "1900-").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) continue;
      const match = contacts.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (match && match.birthday) continue;
      s.upsert("contacts", match ? { id: match.id, birthday: b } : { name, birthday: b, phone: get("TEL"), email: get("EMAIL") });
      n++;
    }
    toast(`Added ${n} birthday${n === 1 ? "" : "s"}`);
  };

  return (
    <Modal title="Birthdays on your calendar" onClose={onClose} wide footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <div className="row" style={{ gap: 16 }}>
        <span><b style={{ fontSize: 22 }}>{withBirthday}</b> <span className="muted">{withBirthday === 1 ? "birthday shows" : "birthdays show"} every year, as far ahead as you scroll</span></span>
        {!s.settings.pages.calendar.showBirthdays && (
          <button className="btn sm primary" onClick={() => s.updateSettings((st) => void (st.pages.calendar.showBirthdays = true))}>Show birthdays on the calendar</button>
        )}
      </div>
      <div className="row">
        {googleSignInAvailable() && (
          <button className="btn" disabled={busy || !googleConfigured()} onClick={fromGoogle} title={googleConfigured() ? "" : "Add your Google client ID in Settings first"}>
            {busy ? "Reading Google Contacts…" : "Get birthdays from Google Contacts"}
          </button>
        )}
        <label className="btn">Import from phone contacts (.vcf)<input type="file" accept=".vcf,text/vcard" hidden onChange={(e) => e.target.files?.[0] && importVcf(e.target.files[0])} /></label>
      </div>
      {upcoming.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Coming up</div>
          <div className="row">{upcoming.map(({ c, date, age }) => <span key={c.id} className="chip">{c.name} · {format(date, "d MMM")}{age ? ` · ${age}` : ""}</span>)}</div>
        </div>
      )}
      {without.length > 0 && (
        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="eyebrow">No birthday yet · {without.length}</span>
            <input className="input" style={{ maxWidth: 220 }} placeholder="Find a person" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a person" />
          </div>
          <div className="list">
            {missing.map((c) => (
              <div key={c.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{c.name}</span>
                <input type="date" className="input" style={{ width: 160 }} aria-label={`Birthday for ${c.name}`} onChange={(e) => e.target.value && s.upsert("contacts", { id: c.id, birthday: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>Don't know the year? Pick any year; it only affects the age shown.</div>
        </div>
      )}
    </Modal>
  );
}
