import { useMemo, useState } from "react";
import type { Attendee, CalEvent } from "../types";
import { live, toast, useStore } from "../store";
import {
  attendeeFromText,
  channelsFor,
  defaultChannel,
  inviteText,
  newAttendee,
  rsvpReachableWarning,
  sendInvite,
  STATUS_LABEL,
  TEMPLATE_FIELDS,
  type Channel,
} from "../lib/invites";
import { IMail, IPhone, ISms, IX } from "./Icons";

const CH_LABEL: Record<Channel, string> = { email: "Email", sms: "Text", share: "Share", copy: "Copy" };
const STATUS_COLOR: Record<Attendee["status"], string> = {
  pending: "var(--muted)",
  accepted: "var(--ok)",
  maybe: "var(--warn)",
  declined: "var(--bad)",
};

/**
 * Guests on an event: add people, send each one an invite by email or text, and see their replies.
 * `persist` saves the event (so it has an id the RSVP link can point at) and returns the saved record.
 */
export function InvitePanel({
  ev,
  set,
  persist,
}: {
  ev: Partial<CalEvent>;
  set: (p: Partial<CalEvent>) => void;
  persist: () => CalEvent | null;
}) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [editMsg, setEditMsg] = useState(!!ev.inviteMessage);
  const [preview, setPreview] = useState<string | null>(null);
  const live_ = ev.id ? s.events[ev.id] : undefined;
  // replies can arrive while the editor is open: show the stored status for each guest
  const guests = (ev.attendees ?? []).map((a) => live_?.attendees?.find((x) => x.id === a.id) ?? a);
  const suggestions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const taken = new Set(guests.map((g) => g.contactId));
    return live(s.contacts)
      .filter((c) => !taken.has(c.id) && c.name.toLowerCase().includes(term))
      .slice(0, 6);
  }, [q, s.contacts, guests.length]);
  const warning = rsvpReachableWarning();

  const add = (a: Attendee) => {
    set({ attendees: [...guests, a] });
    setQ("");
  };
  const removeGuest = (id: string) => set({ attendees: guests.filter((g) => g.id !== id) });
  const send = async (a: Attendee, ch: Channel) => {
    const saved = persist();
    if (!saved) return;
    toast(await sendInvite(saved.id, a.id, ch));
  };
  const sendAll = async () => {
    const saved = persist();
    if (!saved) return;
    for (const a of (saved.attendees ?? []).filter((g) => !g.sentAt)) {
      const ch = defaultChannel(a);
      toast(await sendInvite(saved.id, a.id, ch));
      await new Promise((r) => setTimeout(r, 600)); // give the mail / SMS app a moment between guests
    }
  };
  const counts = guests.reduce((m, g) => ((m[g.status] = (m[g.status] ?? 0) + 1), m), {} as Record<string, number>);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="eyebrow">People{guests.length ? ` · ${guests.length}` : ""}</span>
        {guests.length > 0 && (
          <span className="faint" style={{ fontSize: 12.5 }}>
            {(["accepted", "maybe", "declined", "pending"] as const)
              .filter((k) => counts[k])
              .map((k) => `${counts[k]} ${STATUS_LABEL[k].toLowerCase()}`)
              .join(" · ")}
          </span>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Invite someone: name from contacts, email or mobile"
          aria-label="Invite someone"
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              e.preventDefault();
              add(suggestions[0] ? newAttendee({ name: suggestions[0].name, contact: suggestions[0] }) : attendeeFromText(q));
            }
          }}
        />
        {suggestions.length > 0 && (
          <div className="card" style={{ position: "absolute", zIndex: 5, left: 0, right: 0, top: "100%", padding: 4, display: "grid" }}>
            {suggestions.map((c) => (
              <button key={c.id} className="nav-item" onClick={() => add(newAttendee({ name: c.name, contact: c }))}>
                {c.name}{" "}
                <span className="faint" style={{ fontSize: 12 }}>
                  {[c.phone, c.email].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {guests.length > 0 && (
        <div className="list">
          {guests.map((a) => (
            <div key={a.id} className="stack" style={{ gap: 4 }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <span style={{ minWidth: 0 }}>
                  <b>{a.name}</b>{" "}
                  <span className="tag" style={{ color: STATUS_COLOR[a.status] }}>
                    {STATUS_LABEL[a.status]}
                  </span>
                  {a.sentAt && a.status === "pending" && (
                    <span className="faint" style={{ fontSize: 12 }}>
                      {" "}
                      · sent by {CH_LABEL[a.sentVia ?? "copy"].toLowerCase()}
                    </span>
                  )}
                  <div className="faint" style={{ fontSize: 12 }}>
                    {[a.phone, a.email].filter(Boolean).join(" · ") || "No phone or email: use Copy or Share"}
                  </div>
                </span>
                <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  {channelsFor(a).map((ch) => (
                    <button key={ch} className="btn sm" onClick={() => send(a, ch)} title={`Send by ${CH_LABEL[ch].toLowerCase()}`}>
                      {ch === "email" ? (
                        <IMail size={14} />
                      ) : ch === "sms" ? (
                        <ISms size={14} />
                      ) : ch === "share" ? (
                        <IPhone size={14} />
                      ) : null}{" "}
                      {CH_LABEL[ch]}
                    </button>
                  ))}
                  <button className="btn ghost icon sm" onClick={() => removeGuest(a.id)} aria-label={`Remove ${a.name}`}>
                    <IX size={14} />
                  </button>
                </span>
              </div>
              {a.note && (
                <div className="muted" style={{ fontSize: 13, paddingLeft: 2 }}>
                  “{a.note}”
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {guests.length > 0 && (
        <>
          <div className="row">
            <button className="btn sm primary" onClick={sendAll} disabled={!guests.some((g) => !g.sentAt)}>
              Send to everyone not yet invited
            </button>
            <button
              className="btn sm ghost"
              onClick={() => setPreview(preview ? null : inviteText({ ...(ev as CalEvent), attendees: guests }, guests[0]).body)}
            >
              {preview ? "Hide preview" : "Preview message"}
            </button>
            <button className="btn sm ghost" onClick={() => setEditMsg(!editMsg)}>
              {editMsg ? "Use my standard message" : "Write a message for this event"}
            </button>
          </div>
          {editMsg && (
            <>
              <textarea
                className="input"
                rows={4}
                value={ev.inviteMessage ?? s.settings.invites.template}
                onChange={(e) => set({ inviteMessage: e.target.value })}
                aria-label="Invite message"
              />
              <div className="row faint" style={{ fontSize: 12 }}>
                Fill-ins: {TEMPLATE_FIELDS.join(" ")}
                <button
                  className="btn sm ghost"
                  onClick={() => (
                    s.updateSettings((st) => void (st.invites.template = ev.inviteMessage ?? st.invites.template)),
                    toast("Saved as your standard invite")
                  )}
                >
                  Save as my standard message
                </button>
              </div>
            </>
          )}
          {preview && (
            <pre className="card" style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", fontSize: 13 }}>
              {preview}
            </pre>
          )}
          {warning && <div className="alert">{warning}</div>}
        </>
      )}
    </div>
  );
}
