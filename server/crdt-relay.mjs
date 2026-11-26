/**
 * Real-time CRDT sync endpoints, attached to the relay's HTTP server (see sync-server.mjs).
 *
 *  /signal  y-webrtc signaling: lets two devices find each other and open a direct WebRTC link. Messages are
 *           encrypted by the apps with the pairing code, so this server only forwards them.
 *  /crdt    fallback relay for when no direct link exists (away from home Wi-Fi). Holds one Yjs document per room,
 *           saves it to DATA_DIR and fans updates out. Frame = 1 type byte + payload:
 *           0 full state, 1 update, 2 ping (echoed back, used to show the relay round-trip time).
 *
 * Room names are 32 to 64 hex characters (the apps send a hash of the pairing code, never the code itself).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import * as Y from "yjs";

const ROOM_RE = /^[0-9a-f]{32,64}$/;
const MAX_STATE = 64 * 1024 * 1024;

export function attachCrdt(dataDir) {
  mkdirSync(dataDir, { recursive: true });

  /* ---- y-webrtc signaling ---- */
  const topics = new Map(); // topic -> Set<ws>
  const signal = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  signal.on("connection", (ws) => {
    ws.topics = new Set();
    ws.alive = true;
    ws.on("pong", () => (ws.alive = true));
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg?.type === "subscribe" && Array.isArray(msg.topics)) {
        for (const t of msg.topics) {
          if (typeof t !== "string" || t.length > 128 || ws.topics.size >= 8) continue;
          ws.topics.add(t);
          if (!topics.has(t)) topics.set(t, new Set());
          topics.get(t).add(ws);
        }
      } else if (msg?.type === "unsubscribe" && Array.isArray(msg.topics)) {
        for (const t of msg.topics) {
          topics.get(t)?.delete(ws);
          ws.topics.delete(t);
        }
      } else if (msg?.type === "publish" && typeof msg.topic === "string") {
        const subs = topics.get(msg.topic);
        if (!subs || !ws.topics.has(msg.topic)) return; // only publish to topics you joined
        msg.clients = subs.size;
        const out = JSON.stringify(msg);
        for (const s of subs) if (s.readyState === 1) s.send(out);
      } else if (msg?.type === "ping") {
        ws.send('{"type":"pong"}');
      }
    });
    ws.on("close", () => {
      for (const t of ws.topics) {
        topics.get(t)?.delete(ws);
        if (!topics.get(t)?.size) topics.delete(t);
      }
    });
  });

  /* ---- fallback relay ---- */
  const rooms = new Map(); // room -> { doc, clients, timer }
  function room(name) {
    let r = rooms.get(name);
    if (r) return r;
    const doc = new Y.Doc();
    const file = join(dataDir, `crdt-${name}.bin`);
    if (existsSync(file)) {
      try {
        Y.applyUpdate(doc, readFileSync(file));
      } catch (e) {
        console.error("crdt: could not read", name, e.message);
      }
    }
    r = { doc, clients: new Set(), timer: null, file };
    doc.on("update", () => {
      clearTimeout(r.timer);
      r.timer = setTimeout(() => {
        const state = Y.encodeStateAsUpdate(doc);
        if (state.length <= MAX_STATE) writeFileSync(file, state);
      }, 1500);
    });
    rooms.set(name, r);
    return r;
  }
  const frame = (type, bytes) => {
    const out = new Uint8Array(bytes.length + 1);
    out[0] = type;
    out.set(bytes, 1);
    return out;
  };
  const relay = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
  relay.on("connection", (ws, req) => {
    const name = new URL(req.url, "http://x").searchParams.get("room") || "";
    if (!ROOM_RE.test(name)) return ws.close(4000, "bad room");
    const r = room(name);
    r.clients.add(ws);
    ws.send(frame(0, Y.encodeStateAsUpdate(r.doc)));
    ws.on("message", (raw, isBinary) => {
      if (!isBinary || raw.length < 1) return;
      const buf = new Uint8Array(raw);
      const type = buf[0];
      if (type === 2) return ws.send(buf);
      if (type !== 0 && type !== 1) return;
      const update = buf.subarray(1);
      try {
        Y.applyUpdate(r.doc, update, ws);
      } catch {
        return; // malformed update: ignore it
      }
      const out = frame(1, update);
      for (const c of r.clients) if (c !== ws && c.readyState === 1) c.send(out);
    });
    ws.on("close", () => r.clients.delete(ws));
  });

  const beat = setInterval(() => {
    for (const ws of signal.clients) {
      if (!ws.alive) ws.terminate();
      else {
        ws.alive = false;
        ws.ping();
      }
    }
  }, 30000);
  beat.unref();

  /** Returns true when the upgrade was for one of ours. */
  return (req, socket, head) => {
    const path = new URL(req.url, "http://x").pathname;
    const wss = path === "/signal" ? signal : path === "/crdt" ? relay : null;
    if (!wss) return false;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    return true;
  };
}
