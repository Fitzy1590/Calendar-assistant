import { addDays, addMinutes, startOfDay } from "date-fns";
import { cleanTitle, parseWhen } from "./nlp";
import { conflictsFor } from "./planner";
import type { Occurrence } from "./recurrence";

/**
 * "Scan my email for events": pull recent mail (and, for Outlook, real calendar entries),
 * find things that look like appointments, then let the user pick which to add.
 *
 * Sign-in uses OAuth in a popup with the user's own client IDs (Settings → Email):
 *  - Google: a "Web application" OAuth client, token flow, scope gmail.readonly.
 *  - Microsoft: an Azure "Single-page application" registration, auth-code + PKCE, Mail.Read + Calendars.Read.
 * The redirect URI to register is `<app origin>/oauth.html`.
 */

export interface Candidate {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  source: string;
  snippet?: string;
  conflicts: Occurrence[];
  googleId?: string;
  recurrence?: import("../types").Recurrence;
}

const KEYWORDS =
  "(appointment OR booking OR reservation OR confirmed OR confirmation OR invitation OR invite OR meeting OR rsvp OR tickets OR flight OR itinerary OR scheduled)";

function popupAuth(url: string): Promise<{ hash: string; search: string }> {
  return new Promise((resolve, reject) => {
    const w = window.open(url, "oauth", "width=520,height=680");
    if (!w) return reject(new Error("Popup blocked"));
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.data?.type !== "oauth") return;
      window.removeEventListener("message", onMsg);
      clearInterval(t);
      resolve(e.data);
    };
    window.addEventListener("message", onMsg);
    const t = setInterval(() => {
      if (w.closed) {
        clearInterval(t);
        window.removeEventListener("message", onMsg);
        reject(new Error("Sign-in window closed"));
      }
    }, 500);
  });
}

const redirectUri = () => `${location.origin}/oauth.html`;

/* ---------- Gmail ---------- */

export async function scanGmail(): Promise<Candidate[]> {
  const { googleToken, SCOPES } = await import("./google");
  const token = await googleToken([SCOPES.gmail]);
  const H = { Authorization: `Bearer ${token}` };
  const list = await (
    await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=${encodeURIComponent(`newer_than:45d ${KEYWORDS}`)}`,
      { headers: H },
    )
  ).json();
  const msgs = await Promise.all(
    (list.messages ?? []).map(async (m: { id: string }) =>
      (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: H })).json(),
    ),
  );
  return msgs.flatMap((m: any) => {
    const header = (n: string) => m.payload?.headers?.find((h: any) => h.name.toLowerCase() === n)?.value ?? "";
    const body = textPart(m.payload) || m.snippet || "";
    const ics = icsPart(m.payload);
    if (ics) return parseIcs(ics, "Gmail");
    return extract(`gmail:${m.id}`, header("subject"), body, "Gmail");
  });
}

function decode(b64: string) {
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}
function textPart(p: any): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return decode(p.body.data);
  for (const c of p.parts ?? []) {
    const t = textPart(c);
    if (t) return t;
  }
  return "";
}
function icsPart(p: any): string {
  if (!p) return "";
  if (p.mimeType === "text/calendar" && p.body?.data) return decode(p.body.data);
  for (const c of p.parts ?? []) {
    const t = icsPart(c);
    if (t) return t;
  }
  return "";
}

/* ---------- Outlook / Microsoft 365 ---------- */

async function pkce() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

export async function scanOutlook(clientId: string): Promise<Candidate[]> {
  const { verifier, challenge } = await pkce();
  const scope = "openid offline_access Mail.Read Calendars.Read";
  const auth = await popupAuth(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri())}&scope=${encodeURIComponent(scope)}` +
      `&code_challenge=${challenge}&code_challenge_method=S256&prompt=select_account`,
  );
  const code = new URLSearchParams(auth.search).get("code");
  if (!code) throw new Error("Microsoft sign-in did not return a code");
  const tok = await (
    await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
        scope,
      }),
    })
  ).json();
  if (!tok.access_token) throw new Error(tok.error_description || "Token exchange failed");
  const H = { Authorization: `Bearer ${tok.access_token}` };
  const now = new Date();
  const cal = await (
    await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${addDays(now, 90).toISOString()}&$top=100&$select=id,subject,start,end,isAllDay,location`,
      { headers: { ...H, Prefer: 'outlook.timezone="' + Intl.DateTimeFormat().resolvedOptions().timeZone + '"' } },
    )
  ).json();
  const fromCal: Candidate[] = (cal.value ?? []).map((e: any) =>
    withConflicts({
      id: `outlook:${e.id}`,
      title: e.subject,
      start: new Date(e.start.dateTime),
      end: new Date(e.end.dateTime),
      allDay: e.isAllDay,
      location: e.location?.displayName || undefined,
      source: "Outlook calendar",
    }),
  );
  const mail = await (
    await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$top=40&$select=id,subject,bodyPreview&$search=${encodeURIComponent(`"${KEYWORDS.replace(/[()]/g, "")}"`)}`,
      { headers: H },
    )
  ).json();
  const fromMail = (mail.value ?? []).flatMap((m: any) => extract(`outlookmail:${m.id}`, m.subject, m.bodyPreview, "Outlook mail"));
  return [...fromCal, ...fromMail];
}

/* ---------- Text & .ics extraction (also used for pasted emails and dropped files) ---------- */

export function extract(id: string, subject: string, body: string, source: string): Candidate[] {
  const text = `${subject}. ${body}`.replace(/\s+/g, " ").slice(0, 2000);
  const w = parseWhen(text);
  if (!w.date || w.date < startOfDay(new Date())) return [];
  const allDay = w.hour === undefined;
  const start = new Date(w.date);
  if (!allDay) start.setHours(w.hour!, w.minute ?? 0);
  const loc = text.match(/\b(?:at|venue|location|where)[:\s]+([A-Z][\w'&.-]*(?: [A-Z0-9][\w'&.-]*){0,5})/)?.[1];
  return [
    withConflicts({
      id,
      title:
        cleanTitle(
          subject
            .replace(/^(re|fw|fwd):\s*/i, "")
            .replace(/\b(confirmation|confirmed|reminder)\b:?/gi, "")
            .trim(),
        ) || "Event from email",
      start,
      end: allDay ? addDays(start, 1) : addMinutes(start, w.durationMins ?? 60),
      allDay,
      location: loc,
      source,
      snippet: body.slice(0, 160),
    }),
  ];
}

export function parseIcs(ics: string, source = ".ics file"): Candidate[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  return unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .flatMap((block, i) => {
      const get = (k: string) => block.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "m"))?.[1]?.trim();
      const ds = get("DTSTART");
      if (!ds) return [];
      const start = icsDate(ds);
      const de = get("DTEND");
      const allDay = /^\d{8}$/.test(ds);
      const end = de ? icsDate(de) : allDay ? addDays(start, 1) : addMinutes(start, 60);
      return [
        withConflicts({
          id: `ics:${get("UID") ?? i}`,
          title: (get("SUMMARY") ?? "Untitled").replace(/\\,/g, ",").replace(/\\n/g, " "),
          start,
          end,
          allDay,
          location: get("LOCATION")?.replace(/\\,/g, ","),
          source,
        }),
      ];
    });
}

function icsDate(v: string) {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return new Date(v);
  if (!m[4]) return new Date(+m[1], +m[2] - 1, +m[3]);
  if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function withConflicts(c: Omit<Candidate, "conflicts">): Candidate {
  return { ...c, conflicts: c.allDay ? [] : conflictsFor(c.start, c.end) };
}

/** Flag candidates that overlap each other too, so picking two clashing ones is caught. */
export function crossConflicts(selected: Candidate[]): [Candidate, Candidate][] {
  const out: [Candidate, Candidate][] = [];
  const timed = selected.filter((c) => !c.allDay);
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++)
      if (timed[i].start < timed[j].end && timed[j].start < timed[i].end) out.push([timed[i], timed[j]]);
  return out;
}
