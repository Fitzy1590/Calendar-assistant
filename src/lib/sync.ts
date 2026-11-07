import { onLocalChange, useStore, type Change } from "../store";
import { platformName } from "./platform";

/**
 * Realtime sync between the Windows and Android apps through the small relay in /server.
 *
 * Protocol (JSON over WebSocket, one "room" per pairing code):
 *   -> hello {since}            <- snapshot {changes, seq}
 *   -> change {change}          <- change {change, seq, from}      (fan-out to other devices)
 *   -> command {command}        <- command {command, from}          (e.g. "call Luke" from Windows, executed on Android)
 *   -> command-result {...}     <- command-result {...}
 * Records merge last-writer-wins on updatedAt, deletes are tombstones, and changes made
 * while offline are queued in localStorage and flushed on reconnect.
 */

export type DeviceCommand =
  | { id: string; action: "call"; number: string; name?: string }
  | { id: string; action: "sms"; number: string; body?: string; name?: string };

type Status = "off" | "connecting" | "online" | "offline";
let ws: WebSocket | null = null;
let status: Status = "off";
let retry = 0;
let timer: number | undefined;
const statusListeners = new Set<(s: Status, peers: string[]) => void>();
const commandHandlers = new Set<(c: DeviceCommand, from: string) => void>();
const resultHandlers = new Set<(r: { id: string; ok: boolean; message?: string }) => void>();
let peers: string[] = [];
const QUEUE_KEY = "sync-queue";

const queue = (): Change[] => JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
const saveQueue = (q: Change[]) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-5000)));

function setStatus(s: Status) {
  status = s;
  statusListeners.forEach((l) => l(s, peers));
}

export const onSyncStatus = (fn: (s: Status, peers: string[]) => void) => {
  statusListeners.add(fn);
  fn(status, peers);
  return () => statusListeners.delete(fn);
};
export const onDeviceCommand = (fn: (c: DeviceCommand, from: string) => void) => {
  commandHandlers.add(fn);
  return () => commandHandlers.delete(fn);
};
export const onCommandResult = (fn: (r: { id: string; ok: boolean; message?: string }) => void) => {
  resultHandlers.add(fn);
  return () => resultHandlers.delete(fn);
};

function send(msg: unknown) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export function sendCommand(command: DeviceCommand) {
  return send({ type: "command", command });
}
export function sendCommandResult(r: { id: string; ok: boolean; message?: string }) {
  send({ type: "command-result", result: r });
}
export const hasPhonePeer = () => peers.some((p) => p.startsWith("android"));

export function connect() {
  const { settings, deviceId, lastSyncSeq } = useStore.getState();
  const { serverUrl, pairingCode, enabled, deviceName } = settings.sync;
  disconnect();
  if (!enabled || !serverUrl || !pairingCode) return;
  setStatus("connecting");
  const url = new URL(serverUrl.replace(/^http/, "ws"));
  url.pathname = url.pathname.replace(/\/$/, "") + "/sync";
  url.searchParams.set("room", pairingCode);
  url.searchParams.set("device", deviceId);
  url.searchParams.set("kind", `${platformName()}:${deviceName || platformName()}`);
  const sock = new WebSocket(url);
  ws = sock;

  sock.onopen = () => {
    retry = 0;
    setStatus("online");
    send({ type: "hello", since: lastSyncSeq });
    const q = queue();
    q.forEach((change) => send({ type: "change", change }));
    saveQueue([]);
  };
  sock.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "snapshot":
        useStore.getState().applyRemote(msg.changes, msg.seq);
        break;
      case "change":
        if (msg.from !== deviceId) useStore.getState().applyRemote([msg.change], msg.seq);
        else useStore.getState().applyRemote([], msg.seq);
        break;
      case "presence":
        peers = (msg.devices as { id: string; kind: string }[]).filter((d) => d.id !== deviceId).map((d) => d.kind);
        setStatus(status);
        break;
      case "command":
        commandHandlers.forEach((h) => h(msg.command, msg.from));
        break;
      case "command-result":
        resultHandlers.forEach((h) => h(msg.result));
        break;
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    peers = [];
    setStatus("offline");
    retry = Math.min(retry + 1, 6);
    timer = window.setTimeout(connect, 1000 * 2 ** retry);
  };
}

export function disconnect() {
  window.clearTimeout(timer);
  const s = ws;
  ws = null;
  s?.close();
  peers = [];
  setStatus("off");
}

/** Wire the store to the socket. Call once at startup. */
export function startSync() {
  onLocalChange((change) => {
    if (!send({ type: "change", change })) saveQueue([...queue(), change]);
  });
  let prev = JSON.stringify(useStore.getState().settings.sync);
  useStore.subscribe((s) => {
    const next = JSON.stringify(s.settings.sync);
    if (next !== prev) {
      prev = next;
      connect();
    }
  });
  connect();
}
