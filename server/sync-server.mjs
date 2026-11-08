#!/usr/bin/env node
/**
 * Calendar Assistant sync relay.
 *
 *   node server/sync-server.mjs            (PORT=8787 by default)
 *
 * - WebSocket /sync?room=<pairing code>&device=<id>&kind=<platform:name>
 *   Keeps an append-only change log per room (last-writer-wins per record) on disk in ./server/data,
 *   fans changes out to the other devices in the room and relays phone commands (call/SMS).
 * - GET /proxy?url=...  CORS proxy for the browser build (news RSS, sports, events), restricted to an allow-list.
 * - GET/POST /rsvp/<token>  the invite page a guest opens from their email or text: event details, map,
 *   Accept / Maybe / Can't make it with a note, and "add to my calendar". Their answer is written onto the
 *   event and pushed to your devices straight away. Tokens are random per guest; nothing else is exposed.
 * - GET /health
 *
 * Run it on a home PC, a Raspberry Pi or any small VPS. Put it behind HTTPS (Caddy/Cloudflare Tunnel)
 * so the apps connect with wss://. The pairing code is the shared secret: keep it private.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PORT = Number(process.env.PORT || 8787);
const DATA = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(DATA, { recursive: true });

const PROXY_HOSTS = [
  "news.google.com",
  "www.thesportsdb.com",
  "app.ticketmaster.com",
  "nominatim.openstreetmap.org",
  "overpass-api.de",
];

/** room -> { seq, records: Map<key, {seq, change}>, clients: Set<ws> } */
const rooms = new Map();
/** RSVP token -> { room, key } so a guest's link finds their event without knowing the room. */
const tokens = new Map();
function indexRecord(roomName, key, change) {
  if (change.collection !== "events") return;
  for (const a of change.record?.attendees ?? []) if (a?.token && /^[a-f0-9]{32}$/.test(a.token)) tokens.set(a.token, { room: roomName, key });
}

function roomFile(name) {
  return join(DATA, name.replace(/[^A-Za-z0-9-]/g, "_") + ".json");
}
function getRoom(name) {
  let r = rooms.get(name);
  if (r) return r;
  r = { seq: 0, records: new Map(), clients: new Set(), dirty: false };
  const f = roomFile(name);
  if (existsSync(f)) {
    const saved = JSON.parse(readFileSync(f, "utf8"));
    r.seq = saved.seq;
    for (const [k, v] of saved.records) {
      r.records.set(k, v);
      indexRecord(name, k, v.change);
    }
  }
  rooms.set(name, r);
  return r;
}
for (const f of readdirSync(DATA)) if (f.endsWith(".json")) getRoom(f.slice(0, -5));

setInterval(() => {
  for (const [name, r] of rooms) {
    if (!r.dirty) continue;
    writeFileSync(roomFile(name), JSON.stringify({ seq: r.seq, records: [...r.records] }));
    r.dirty = false;
  }
}, 2000);

function presence(room) {
  const devices = [...room.clients].map((c) => ({ id: c.deviceId, kind: c.kind }));
  for (const c of room.clients) c.send(JSON.stringify({ type: "presence", devices }));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Headers", "X-Pairing-Code");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST");
    res.statusCode = 204;
    return res.end();
  }
  if (url.pathname === "/health") return res.end("ok");
  if (url.pathname === "/fetch-page") return fetchPage(req, res, url);
  const rsvp = url.pathname.match(/^\/rsvp\/([a-f0-9]{32})(\/event\.ics)?$/);
  if (rsvp) return handleRsvp(req, res, rsvp[1], !!rsvp[2]);
  if (url.pathname === "/proxy") {
    const target = url.searchParams.get("url");
    let host;
    try {
      host = new URL(target).hostname;
    } catch {
      res.statusCode = 400;
      return res.end("bad url");
    }
    if (!PROXY_HOSTS.includes(host)) {
      res.statusCode = 403;
      return res.end("host not allowed");
    }
    try {
      const r = await fetch(target, { headers: { "User-Agent": "CalendarAssistant/0.1" } });
      res.statusCode = r.status;
      res.setHeader("Content-Type", r.headers.get("content-type") || "text/plain");
      return res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.statusCode = 502;
      return res.end(String(e));
    }
  }
  res.statusCode = 404;
  res.end();
});

/* ---------------- product pages for price tracking (browser build only) ---------------- */

function isPrivate(ip) {
  if (ip.includes(":")) return /^(::1|fc|fd|fe80|::ffff:(127|10|192\.168|169\.254)\.)/i.test(ip) || ip === "::";
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Fetch a public product page for a paired device. Not an open proxy: needs a known pairing code. */
async function fetchPage(req, res, url) {
  const code = req.headers["x-pairing-code"];
  if (!code || !rooms.has(String(code))) {
    res.statusCode = 403;
    return res.end("pair this device first");
  }
  let target;
  try {
    target = new URL(url.searchParams.get("url"));
  } catch {
    res.statusCode = 400;
    return res.end("bad url");
  }
  if (target.protocol !== "https:" || target.username || target.port) {
    res.statusCode = 400;
    return res.end("https pages only");
  }
  try {
    const addrs = isIP(target.hostname) ? [{ address: target.hostname }] : await lookup(target.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) {
      res.statusCode = 403;
      return res.end("private address");
    }
    const r = await fetch(target, { redirect: "error", headers: { "User-Agent": "Mozilla/5.0 CalendarAssistant/0.1", Accept: "text/html" }, signal: AbortSignal.timeout(15000) });
    const buf = Buffer.from(await r.arrayBuffer()).subarray(0, 3_000_000);
    res.statusCode = r.status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    return res.end(String(e));
  }
}

/* ---------------- RSVP pages ---------------- */

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LABEL = { accepted: "Going", maybe: "Maybe", declined: "Can't make it", pending: "Not answered yet" };

function findInvite(token) {
  const hit = tokens.get(token);
  if (!hit) return null;
  const room = rooms.get(hit.room);
  const rec = room?.records.get(hit.key);
  const ev = rec?.change.record;
  const a = ev?.attendees?.find((x) => x.token === token);
  if (!ev || ev.deleted || !a) return null;
  return { room, roomName: hit.room, key: hit.key, ev, a };
}

function fmtWhen(ev) {
  const d = new Date(ev.start); // local wall time of the organiser
  const opts = ev.allDay ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" };
  return d.toLocaleString("en-AU", opts) + (ev.tz && !ev.allDay ? ` (${ev.tz.replace(/_/g, " ")} time)` : "");
}
const compact = (iso) => iso.replace(/[-:]/g, "").slice(0, 15) + (iso.length <= 16 ? "00" : "");

function ics(ev) {
  const dt = (iso) => (ev.allDay ? `;VALUE=DATE:${iso.slice(0, 10).replace(/-/g, "")}` : `${ev.tz ? `;TZID=${ev.tz}` : ""}:${compact(iso)}`);
  const e = (v) => String(v ?? "").replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calendar Assistant//RSVP//EN", "BEGIN:VEVENT",
    `UID:${ev.id}@calendar-assistant`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART${dt(ev.start)}`, `DTEND${dt(ev.end)}`, `SUMMARY:${e(ev.title)}`,
    ev.location ? `LOCATION:${e(ev.location)}` : "",
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", `DESCRIPTION:${e(ev.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{margin:0;background:#f4f5f7;color:#16181d;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:520px;margin:0 auto;padding:32px 20px}
.card{background:#fff;border:1px solid #e1e4e8;border-radius:12px;padding:20px;display:grid;gap:10px}
h1{font-size:24px;line-height:1.2;margin:0}.muted{color:#5a6170}
a{color:#1f5fa8}.row{display:flex;flex-wrap:wrap;gap:8px}
button,.btn{font:inherit;border-radius:8px;border:1px solid #c9ced6;background:#fff;padding:12px 16px;min-height:44px;cursor:pointer;text-decoration:none;color:inherit;display:inline-flex;align-items:center}
button.go{background:#1f5fa8;border-color:#1f5fa8;color:#fff}
textarea{font:inherit;width:100%;box-sizing:border-box;border:1px solid #c9ced6;border-radius:8px;padding:10px;min-height:70px}
.status{font-weight:600}
</style></head><body><main>${body}</main></body></html>`;
}

function calendarLinks(token, ev) {
  const g = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: ev.allDay ? `${ev.start.slice(0, 10).replace(/-/g, "")}/${ev.end.slice(0, 10).replace(/-/g, "")}` : `${compact(ev.start)}/${compact(ev.end)}`, location: ev.location ?? "" });
  if (ev.tz && !ev.allDay) g.set("ctz", ev.tz);
  return `<div class="row"><a class="btn" href="/rsvp/${token}/event.ics">Add to my calendar (with reminder)</a>
<a class="btn" href="https://calendar.google.com/calendar/render?${esc(g.toString())}" rel="noopener">Google Calendar</a></div>`;
}

async function handleRsvp(req, res, token, wantIcs) {
  const inv = findInvite(token);
  res.setHeader("Content-Type", wantIcs ? "text/calendar; charset=utf-8" : "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
  if (!inv) {
    res.statusCode = 404;
    return res.end(wantIcs ? "" : page("Invite not found", `<div class="card"><h1>This invite isn't available</h1><p class="muted">It may have been cancelled. Check with the person who invited you.</p></div>`));
  }
  const { ev, a } = inv;
  if (wantIcs) {
    res.setHeader("Content-Disposition", `attachment; filename="invite.ics"`);
    return res.end(ics(ev));
  }
  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4000) break;
    }
    const form = new URLSearchParams(body);
    const status = form.get("status");
    if (!["accepted", "maybe", "declined"].includes(status)) {
      res.statusCode = 400;
      return res.end(page("Invite", `<div class="card"><p>Please choose an answer.</p></div>`));
    }
    const note = (form.get("note") ?? "").trim().slice(0, 500);
    const record = { ...ev, updatedAt: Date.now(), attendees: ev.attendees.map((x) => (x.token === token ? { ...x, status, note: note || undefined, respondedAt: Date.now() } : x)) };
    const change = { collection: "events", record };
    const seq = ++inv.room.seq;
    inv.room.records.set(inv.key, { seq, change });
    inv.room.dirty = true;
    const out = JSON.stringify({ type: "change", change, seq, from: "rsvp" });
    for (const c of inv.room.clients) c.send(out);
    return res.end(page("Thanks", `<div class="card"><h1>Thanks, ${esc(a.name.split(" ")[0])}</h1>
<p>You answered <span class="status">${esc(LABEL[status])}</span> for <b>${esc(ev.title)}</b>. ${esc(ev.host ?? "They")} will see it straight away.</p>
${status !== "declined" ? calendarLinks(token, ev) : ""}
<p class="muted"><a href="/rsvp/${token}">Change your answer</a></p></div>`));
  }
  const maps = ev.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}` : null;
  return res.end(page(ev.title, `<div class="card">
<div class="muted">${esc(ev.host ? `${ev.host} invited you` : "You're invited")}</div>
<h1>${esc(ev.title)}</h1>
<div><b>${esc(fmtWhen(ev))}</b></div>
${ev.location ? `<div>${esc(ev.location)} · <a href="${esc(maps)}" rel="noopener">Open in Google Maps</a></div>` : ""}
${a.status !== "pending" ? `<div class="muted">Your answer so far: <span class="status">${esc(LABEL[a.status])}</span></div>` : ""}
<form method="post" style="display:grid;gap:10px;margin-top:6px">
<label class="muted" for="note">Add a note (optional)</label>
<textarea id="note" name="note" maxlength="500" placeholder="e.g. I'll be 10 minutes late">${esc(a.note ?? "")}</textarea>
<div class="row">
<button class="go" name="status" value="accepted">Accept</button>
<button name="status" value="maybe">Maybe</button>
<button name="status" value="declined">Can't make it</button>
</div></form>
${calendarLinks(token, ev)}
</div>`));
}

const wss = new WebSocketServer({ server, path: "/sync", maxPayload: 2 * 1024 * 1024 });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const roomName = url.searchParams.get("room");
  if (!roomName || roomName.length < 8) return ws.close(4000, "pairing code required");
  const room = getRoom(roomName);
  ws.deviceId = url.searchParams.get("device") || "anon";
  ws.kind = url.searchParams.get("kind") || "unknown";
  room.clients.add(ws);
  presence(room);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "ping") {
      ws.send('{"type":"pong"}');
    } else if (msg.type === "hello") {
      const since = Number(msg.since) || 0;
      const changes = [...room.records.values()].filter((r) => r.seq > since).map((r) => r.change);
      ws.send(JSON.stringify({ type: "snapshot", changes, seq: room.seq }));
    } else if (msg.type === "change" && msg.change?.record?.id) {
      const key = `${msg.change.collection}:${msg.change.record.id}`;
      const cur = room.records.get(key);
      if (cur && cur.change.record.updatedAt > msg.change.record.updatedAt) return; // stale
      const seq = ++room.seq;
      room.records.set(key, { seq, change: msg.change });
      indexRecord(roomName, key, msg.change);
      room.dirty = true;
      const out = JSON.stringify({ type: "change", change: msg.change, seq, from: ws.deviceId });
      for (const c of room.clients) c.send(out);
    } else if (msg.type === "command" || msg.type === "command-result") {
      const out = JSON.stringify({ ...msg, from: ws.deviceId });
      for (const c of room.clients) if (c !== ws) c.send(out);
    }
  });
  ws.on("close", () => {
    room.clients.delete(ws);
    presence(room);
  });
});

server.listen(PORT, () => console.log(`Calendar Assistant sync relay on :${PORT} (data in ${DATA})`));
