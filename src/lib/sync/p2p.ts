import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { useStore } from "../../store";
import { doc, onRemoteChange, startCrdt } from "./crdtEngine";
import { logDiag } from "./diagnostics";
import { useP2p } from "./p2pStatus";

/**
 * Transport for the Yjs document. Two paths run side by side:
 *  - direct WebRTC link between devices (signaling through the relay at /signal, encrypted with the pairing code),
 *  - the relay at /crdt, used away from home Wi-Fi and to catch up devices that were never online together.
 * The pairing code itself never leaves the device: rooms are named by a hash of it.
 */
const RELAY = "relay";
const set = useP2p.setState;

async function roomId(code: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ca-sync:${code}`));
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 48);
}

function wsUrl(server: string, path: string, room?: string) {
  const u = new URL(server.replace(/^http/, "ws"));
  u.pathname = u.pathname.replace(/\/$/, "") + path;
  if (room) u.searchParams.set("room", room);
  return u;
}

function connectRelay(url: URL) {
  let ws: WebSocket | null = null;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let pingAt = 0;
  let stopped = false;
  const send = (type: number, bytes: Uint8Array = new Uint8Array(0)) => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    const out = new Uint8Array(bytes.length + 1);
    out[0] = type;
    out.set(bytes, 1);
    ws.send(out);
  };
  const open = () => {
    const sock = new WebSocket(url);
    ws = sock;
    sock.binaryType = "arraybuffer";
    sock.onopen = () => {
      retry = 0;
      set({ relay: true });
      logDiag("relay open");
      send(0, Y.encodeStateAsUpdate(doc)); // everything made while offline goes up in one message
      const beat = () => {
        pingAt = Date.now();
        send(2);
      };
      beat();
      ping = setInterval(beat, 15000);
    };
    sock.onmessage = (ev) => {
      const b = new Uint8Array(ev.data as ArrayBuffer);
      if (b[0] === 2) set({ relayRtt: Date.now() - pingAt });
      else if (b[0] === 0 || b[0] === 1) {
        try {
          Y.applyUpdate(doc, b.subarray(1), RELAY);
        } catch (e) {
          logDiag("relay bad update", String(e));
        }
      }
    };
    sock.onclose = () => {
      clearInterval(ping);
      if (ws !== sock) return;
      set({ relay: false, relayRtt: null });
      logDiag("relay closed", { retryInS: 2 ** Math.min(retry + 1, 6) });
      if (!stopped) timer = setTimeout(open, 1000 * 2 ** Math.min(++retry, 6));
    };
  };
  const onUpdate = (u: Uint8Array, origin: unknown) => {
    if (origin !== RELAY && origin !== "disk") send(1, u);
  };
  doc.on("update", onUpdate);
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(ping);
    doc.off("update", onUpdate);
    const s = ws;
    ws = null;
    s?.close();
    set({ relay: false, relayRtt: null });
  };
}

let stopCurrent: (() => void) | null = null;
let generation = 0;

async function run() {
  const mine = ++generation;
  stopCurrent?.();
  stopCurrent = null;
  const { p2p, serverUrl, pairingCode } = useStore.getState().settings.sync;
  if (!p2p || !serverUrl || pairingCode.length < 8) {
    set({ running: false, signaling: false, peers: 0, relay: false, error: "" });
    return;
  }
  try {
    const stopEngine = await startCrdt();
    const id = await roomId(pairingCode);
    if (mine !== generation) return stopEngine();
    const provider = new WebrtcProvider(id, doc, { signaling: [wsUrl(serverUrl, "/signal").toString()], password: pairingCode });
    provider.on("status", (e: { connected: boolean }) => {
      set({ signaling: e.connected });
      logDiag("signaling", { connected: e.connected });
    });
    provider.on("peers", (e: { webrtcPeers: string[]; bcPeers: string[] }) => {
      set({ peers: e.webrtcPeers.length });
      logDiag("peers", { direct: e.webrtcPeers.length, sameBrowser: e.bcPeers.length });
    });
    const stopRelay = connectRelay(wsUrl(serverUrl, "/crdt", id));
    const offRemote = onRemoteChange(() => set({ lastRemoteAt: Date.now() }));
    set({ running: true, error: "" });
    stopCurrent = () => {
      offRemote();
      stopRelay();
      provider.destroy();
      stopEngine();
      set({ running: false, signaling: false, peers: 0 });
    };
  } catch (e) {
    set({ running: false, error: String((e as Error).message ?? e) });
    logDiag("start failed", String(e));
  }
}

/** Start (or restart) real-time sync whenever the on/off switch, server address or pairing code changes. Call once at start-up. */
export function startP2p() {
  let prev = "";
  const check = () => {
    const { p2p, serverUrl, pairingCode } = useStore.getState().settings.sync;
    const next = JSON.stringify([p2p, serverUrl, pairingCode]);
    if (next === prev) return;
    prev = next;
    void run();
  };
  useStore.subscribe(check);
  check();
}
