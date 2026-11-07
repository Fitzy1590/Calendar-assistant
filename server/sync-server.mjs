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
 * - GET /health
 *
 * Run it on a home PC, a Raspberry Pi or any small VPS. Put it behind HTTPS (Caddy/Cloudflare Tunnel)
 * so the apps connect with wss://. The pairing code is the shared secret: keep it private.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const DATA = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), "data");
mkdirSync(DATA, { recursive: true });

const PROXY_HOSTS = [
  "news.google.com",
  "www.thesportsdb.com",
  "app.ticketmaster.com",
  "nominatim.openstreetmap.org",
];

/** room -> { seq, records: Map<key, {seq, change}>, clients: Set<ws> } */
const rooms = new Map();

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
    for (const [k, v] of saved.records) r.records.set(k, v);
  }
  rooms.set(name, r);
  return r;
}
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
  if (url.pathname === "/health") return res.end("ok");
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
    if (msg.type === "hello") {
      const since = Number(msg.since) || 0;
      const changes = [...room.records.values()].filter((r) => r.seq > since).map((r) => r.change);
      ws.send(JSON.stringify({ type: "snapshot", changes, seq: room.seq }));
    } else if (msg.type === "change" && msg.change?.record?.id) {
      const key = `${msg.change.collection}:${msg.change.record.id}`;
      const cur = room.records.get(key);
      if (cur && cur.change.record.updatedAt > msg.change.record.updatedAt) return; // stale
      const seq = ++room.seq;
      room.records.set(key, { seq, change: msg.change });
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
