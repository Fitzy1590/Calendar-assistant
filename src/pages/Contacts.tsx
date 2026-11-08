import { format } from "date-fns";
import { useState } from "react";
import type { Contact } from "../types";
import { live, toast, useStore } from "../store";
import { placeCall, sendSms } from "../lib/phone";
import { nextBirthday } from "../lib/reminders";
import { fromYmd } from "../lib/util";
import { ICake, IPhone, IPlus, ISearch, ISms, IStar } from "../components/Icons";
import { Field, Modal, PageHead } from "../components/ui";

export function Contacts() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [sms, setSms] = useState<Contact | null>(null);
  const all = live(s.contacts).sort((a, b) => Number(!!b.favourite) - Number(!!a.favourite) || a.name.localeCompare(b.name));
  const list = all.filter((c) => (c.name + (c.phone ?? "") + (c.email ?? "")).toLowerCase().includes(q.toLowerCase()));

  const importVcf = async (file: File) => {
    const text = await file.text();
    let n = 0;
    for (const card of text.split("BEGIN:VCARD").slice(1)) {
      const get = (k: string) => card.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "m"))?.[1]?.trim();
      const name = get("FN");
      if (!name) continue;
      const b = get("BDAY")?.replace(/^--/, "1900-").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
      s.upsert("contacts", { name, phone: get("TEL"), email: get("EMAIL"), birthday: b && /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : undefined });
      n++;
    }
    toast(`Imported ${n} contacts`);
  };

  return (
    <>
      <PageHead title="Contacts" sub={`${all.length} people · ${all.filter((c) => c.birthday).length} birthdays`} actions={<>
        <label className="btn">Import .vcf<input type="file" accept=".vcf,text/vcard" hidden onChange={(e) => e.target.files?.[0] && importVcf(e.target.files[0])} /></label>
        <button className="btn primary" onClick={() => setEdit({})}><IPlus /> Add contact</button>
      </>} />
      <div className="command" style={{ maxWidth: 420, marginBottom: 16 }}><ISearch /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" /></div>
      <div className="card">
        <div className="list">
          {list.map((c) => {
            const nb = c.birthday ? nextBirthday(c.birthday) : null;
            return (
              <div key={c.id} className="row" style={{ justifyContent: "space-between" }}>
                <span className="row" style={{ cursor: "pointer" }} onClick={() => setEdit(c)}>
                  <button className="btn ghost icon sm" onClick={(e) => (e.stopPropagation(), s.upsert("contacts", { id: c.id, favourite: !c.favourite }))} aria-label="Favourite" style={{ color: c.favourite ? "var(--accent)" : undefined }}><IStar size={16} filled={c.favourite} /></button>
                  <span><b>{c.name}</b><div className="faint" style={{ fontSize: 12.5 }}>{[c.phone, c.email].filter(Boolean).join(" · ")}</div></span>
                </span>
                <span className="row">
                  {nb && <span className="muted row" style={{ fontSize: 12.5, gap: 4 }}><ICake size={14} /> {format(fromYmd(c.birthday!), "d MMM")}{nb.age ? ` · turns ${nb.age}` : ""}</span>}
                  <button className="btn sm" disabled={!c.phone} onClick={async () => toast(await placeCall(c.name))}><IPhone size={15} /> Call</button>
                  <button className="btn sm" disabled={!c.phone} onClick={() => setSms(c)}><ISms size={15} /> Text</button>
                </span>
              </div>
            );
          })}
          {!list.length && <div className="empty">{all.length ? "No matches." : "No contacts yet. Add one, import a .vcf export from your phone, or say \"Add contact Luke 0412 345 678\"."}</div>}
        </div>
      </div>
      {edit && <ContactEditor c={edit} onClose={() => setEdit(null)} />}
      {sms && <SmsModal c={sms} onClose={() => setSms(null)} />}
    </>
  );
}

function ContactEditor({ c, onClose }: { c: Partial<Contact>; onClose: () => void }) {
  const s = useStore();
  const [v, setV] = useState(c);
  const set = (p: Partial<Contact>) => setV({ ...v, ...p });
  return (
    <Modal title={c.id ? "Edit contact" : "New contact"} onClose={onClose} footer={<>
      {c.id && <button className="btn danger" onClick={() => (s.remove("contacts", c.id!), onClose())}>Delete</button>}
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={() => v.name?.trim() && (s.upsert("contacts", v as Contact), onClose())}>Save</button>
    </>}>
      <Field label="Name"><input className="input" autoFocus value={v.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="Mobile"><input className="input" type="tel" value={v.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={v.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></Field>
      </div>
      <Field label="Birthday (year optional, use 1900 if unknown)"><input className="input" type="date" value={v.birthday ?? ""} onChange={(e) => set({ birthday: e.target.value || undefined })} /></Field>
      <Field label="Notes"><textarea className="input" rows={2} value={v.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} /></Field>
    </Modal>
  );
}

function SmsModal({ c, onClose }: { c: Contact; onClose: () => void }) {
  const [body, setBody] = useState("");
  return (
    <Modal title={`Text ${c.name}`} onClose={onClose} footer={<button className="btn primary" onClick={async () => (toast(await sendSms(c.name, body)), onClose())}>Send via phone</button>}>
      <textarea className="input" rows={4} autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" />
      <div className="faint" style={{ fontSize: 12.5 }}>The message opens on your Android phone, ready to send.</div>
    </Modal>
  );
}
