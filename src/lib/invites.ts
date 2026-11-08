import { format } from "date-fns";
import type { Attendee, CalEvent, Contact } from "../types";
import { findContact, toast, useStore } from "../store";
import { openUrl, isAndroid } from "./platform";
import { sendSms } from "./phone";
import { fromYmd, uid } from "./util";

/**
 * Invitations to events and catch-ups.
 *
 * Each guest gets a message built from your standard template (or the event's own message) with the
 * time, place, a Google Maps link and, when sync is set up, a personal RSVP link. The link opens a small
 * page on your sync server where they tap Accept / Maybe / Can't make it and can leave a note; it also
 * offers "Add to my calendar" with a reminder. Their answer lands on the event in both apps.
 * Messages go out through your own email app or your phone's SMS, so they come from you.
 */

export const TEMPLATE_FIELDS = ["{name}", "{title}", "{when}", "{where}", "{maps}", "{rsvp}", "{from}"];

export function rsvpBase(): string | null {
  const { serverUrl, enabled } = useStore.getState().settings.sync;
  if (!enabled || !serverUrl) return null;
  return serverUrl
    .replace(/^ws/, "http")
    .replace(/\/sync\/?$/, "")
    .replace(/\/$/, "");
}

/** RSVP links only work if guests can reach the server from the internet. */
export function rsvpReachableWarning(): string | null {
  const base = rsvpBase();
  if (!useStore.getState().settings.invites.rsvpLinks) return null;
  if (!base) return "Accept links need the sync server (Settings → Phone & sync). Until then, invites ask people to reply to you.";
  const host = new URL(base).hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || !host.includes("."))
    return `Your sync server (${host}) looks private, so guests outside your home network can't open Accept links. Put it behind a public HTTPS address (see README).`;
  return null;
}

export const mapsLink = (location: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

export function whenText(ev: Pick<CalEvent, "start" | "end" | "allDay">) {
  const s = fromYmd(ev.start);
  if (ev.allDay) return format(s, "EEEE d MMMM");
  return `${format(s, "EEEE d MMMM")} at ${format(s, "h:mm a").toLowerCase()}`;
}

export function inviteText(ev: CalEvent, a: Attendee): { subject: string; body: string } {
  const st = useStore.getState().settings;
  const tpl = ev.inviteMessage?.trim() || st.invites.template;
  const base = rsvpBase();
  const rsvp = st.invites.rsvpLinks && base ? `Let me know here: ${base}/rsvp/${a.token}\n` : "Let me know if you can make it.\n";
  const vals: Record<string, string> = {
    "{name}": a.name.split(" ")[0],
    "{title}": ev.title,
    "{when}": whenText(ev),
    "{where}": ev.location ? ` at ${ev.location}` : "",
    "{maps}": ev.location ? `Map: ${mapsLink(ev.location)}\n` : "",
    "{rsvp}": rsvp,
    "{from}": st.displayName || "me",
  };
  let body = tpl;
  for (const [k, v] of Object.entries(vals)) body = body.split(k).join(v);
  if (!tpl.includes("{rsvp}")) body += `\n${rsvp}`;
  return { subject: `${ev.title} · ${whenText(ev)}`, body: body.replace(/\n{3,}/g, "\n\n").trim() };
}

export function newAttendee(p: { name: string; contact?: Contact; email?: string; phone?: string }): Attendee {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  return {
    id: uid(),
    name: p.contact?.name ?? p.name,
    contactId: p.contact?.id,
    email: p.email ?? p.contact?.email,
    phone: p.phone ?? p.contact?.phone,
    status: "pending",
    token,
  };
}

export function attendeeFromText(text: string): Attendee {
  const t = text.trim();
  if (/@/.test(t)) return newAttendee({ name: t.split("@")[0], email: t });
  if (/^[+\d][\d\s()-]{5,}$/.test(t)) return newAttendee({ name: t, phone: t });
  const c = findContact(t);
  return newAttendee({ name: c?.name ?? t, contact: c });
}

export type Channel = "email" | "sms" | "share" | "copy";

export function channelsFor(a: Attendee): Channel[] {
  const out: Channel[] = [];
  if (a.email) out.push("email");
  if (a.phone) out.push("sms");
  if (typeof navigator !== "undefined" && "share" in navigator && isAndroid()) out.push("share");
  out.push("copy");
  return out;
}

export function defaultChannel(a: Attendee): Channel {
  const pref = useStore.getState().settings.invites.channel;
  if (pref === "email" && a.email) return "email";
  if (pref === "sms" && a.phone) return "sms";
  return a.phone ? "sms" : a.email ? "email" : "copy";
}

/** Send one invite. The event must already be saved (it needs an id for replies to find it). */
export async function sendInvite(evId: string, attendeeId: string, channel: Channel): Promise<string> {
  const st = useStore.getState();
  const ev = st.events[evId];
  const a = ev?.attendees?.find((x) => x.id === attendeeId);
  if (!ev || !a) return "Save the event first.";
  const { subject, body } = inviteText(ev, a);
  let result: string;
  switch (channel) {
    case "email":
      if (!a.email) return `No email address for ${a.name}.`;
      await openUrl(`mailto:${encodeURIComponent(a.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
      result = `Invite to ${a.name} is ready in your email app.`;
      break;
    case "sms":
      if (!a.phone) return `No mobile number for ${a.name}.`;
      result = await sendSms(a.phone, body);
      break;
    case "share":
      await (navigator as Navigator).share({ title: subject, text: body });
      result = "Shared.";
      break;
    default:
      await navigator.clipboard.writeText(body).catch(() => {});
      result = `Invite for ${a.name} copied. Paste it into any chat.`;
  }
  const host = st.settings.displayName || undefined;
  st.upsert("events", {
    id: ev.id,
    host,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    attendees: (ev.attendees ?? []).map((x) => (x.id === a.id ? { ...x, sentAt: Date.now(), sentVia: channel } : x)),
  } as Partial<CalEvent>);
  return result;
}

export const STATUS_LABEL: Record<Attendee["status"], string> = {
  pending: "Invited",
  accepted: "Going",
  maybe: "Maybe",
  declined: "Can't make it",
};

/** Notice replies that arrive through sync and tell the user. Call once at startup. */
export function startReplyWatcher(notify: (title: string, body: string) => void) {
  const seen = new Map<string, number>();
  const scan = (first: boolean) => {
    const s = useStore.getState();
    for (const ev of Object.values(s.events)) {
      for (const a of ev.attendees ?? []) {
        const key = `${ev.id}:${a.id}`;
        const at = a.respondedAt ?? 0;
        if (!first && at > (seen.get(key) ?? 0) && a.status !== "pending" && s.settings.invites.notifyReplies) {
          const msg = `${a.name}: ${STATUS_LABEL[a.status]} · ${ev.title}${a.note ? ` — “${a.note}”` : ""}`;
          toast(msg);
          notify("Invite reply", msg);
        }
        seen.set(key, at);
      }
    }
  };
  scan(true);
  useStore.subscribe((st, prev) => st.events !== prev.events && scan(false));
}
