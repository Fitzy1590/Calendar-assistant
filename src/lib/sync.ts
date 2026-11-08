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
const store = {
  get: (k: string) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* storage full or unavailable: sync still works, only the offline queue is lost */
    }
  },
};
let lastSyncedAt = Number(store.get("sync-last") || 0);
let fullResync = false;
let pongTimer: number | undefined;
let pingTimer: number | undefined;
const markSynced = () => {
  lastSyncedAt = Date.now();
  store.set("sync-last", String(lastSyncedAt));
  setStatus(status);
};
export const syncInfo = () => ({ status, peers, lastSyncedAt, pending: queue().length });
let retry = 0;
let timer: number | undefined;
const statusListeners = new Set<(s: Status, peers: string[]) => void>();
const commandHandlers = new Set<(c: DeviceCommand, from: string) => void>();
const resultHandlers = new Set<(r: { id: string; ok: boolean; message?: string }) => void>();
let peers: string[] = [];
const QUEUE_KEY = "sync-queue";

const queue = (): Change[] => JSON.parse(store.get(QUEUE_KEY) || "[]");
const saveQueue = (q: Change[]) => store.set(QUEUE_KEY, JSON.stringify(q.slice(-5000)));

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
    // a forced sync pulls everything (since 0) and re-sends every local record; normally only what's new
    send({ type: "hello", since: fullResync ? 0 : lastSyncSeq });
    const q = fullResync ? allLocalChanges() : queue();
    q.forEach((change) => send({ type: "change", change }));
    saveQueue([]);
    fullResync = false;
    startHeartbeat(sock);
  };
  sock.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.type) {
      case "snapshot":
        useStore.getState().applyRemote(msg.changes, msg.seq);
        markSynced();
        break;
      case "change":
        if (msg.from !== deviceId) useStore.getState().applyRemote([msg.change], msg.seq);
        else useStore.getState().applyRemote([], msg.seq);
        markSynced();
        break;
      case "pong":
        window.clearTimeout(pongTimer);
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
    window.clearInterval(pingTimer);
    window.clearTimeout(pongTimer);
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

/** Every record on this device, for a full re-send. */
function allLocalChanges(): Change[] {
  const s = useStore.getState();
  return (["events", "tasks", "contacts", "notes", "shopping", "prefs", "feedback"] as const).flatMap((collection) =>
    Object.values(s[collection] as Record<string, Change["record"]>).map((record) => ({ collection, record })),
  );
}

/** A quiet connection can die without the browser noticing (sleep, Wi-Fi switch). Ping every 25 s. */
function startHeartbeat(sock: WebSocket) {
  window.clearInterval(pingTimer);
  pingTimer = window.setInterval(() => {
    if (sock.readyState !== WebSocket.OPEN) return;
    sock.send(JSON.stringify({ type: "ping" }));
    window.clearTimeout(pongTimer);
    pongTimer = window.setTimeout(() => sock.close(), 8000);
  }, 25000);
}

/** "Sync now": reconnect and do a full two-way catch-up. */
export function forceSync() {
  fullResync = true;
  retry = 0;
  connect();
}

/** Wire the store to the socket. Call once at startup. */
export function startSync() {
  onLocalChange((change) => {
    if (!send({ type: "change", change })) saveQueue([...queue(), change]);
  });
  // catch up as soon as the app is back on screen or the network returns (Android resumes, laptop wakes)
  const wake = () => {
    if (document.visibilityState !== "visible") return;
    const { enabled } = useStore.getState().settings.sync;
    if (enabled && (!ws || ws.readyState > WebSocket.OPEN)) {
      retry = 0;
      connect();
    } else if (ws?.readyState === WebSocket.OPEN) send({ type: "hello", since: useStore.getState().lastSyncSeq });
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  startSharedPrefs();
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

/* ---------------- preferences shared between devices ---------------- */

/** Settings that make sense to keep the same everywhere. Theme, layout, keys and device names stay per device. */
const SHARED_KEYS = [
  "displayName",
  "units",
  "clock24",
  "weekStartsOn",
  "newsCategories",
  "newsKeywords",
  "newsRegion",
  "sports",
  "teams",
  "reminders",
  "invites",
  "shopping",
] as const;

function startSharedPrefs() {
  const pick = () => {
    const st = useStore.getState().settings as unknown as Record<string, unknown>;
    return Object.fromEntries(SHARED_KEYS.map((k) => [k, st[k]]));
  };
  let lastJson = JSON.stringify(pick());
  let lastRemote = useStore.getState().prefs.shared?.updatedAt ?? 0;
  useStore.subscribe((s, prev) => {
    if (!s.settings.sync.shareSettings) return;
    // incoming from another device
    const remote = s.prefs.shared;
    if (remote && remote !== prev.prefs.shared && remote.updatedAt > lastRemote && !remote.deleted) {
      lastRemote = remote.updatedAt;
      const json = JSON.stringify(remote.data);
      if (json !== lastJson) {
        lastJson = json;
        s.updateSettings((st) => void Object.assign(st, remote.data));
      }
      return;
    }
    // local edit: publish it
    if (s.settings !== prev.settings) {
      const json = JSON.stringify(pick());
      if (json !== lastJson) {
        lastJson = json;
        const rec = s.upsert("prefs", { id: "shared", data: JSON.parse(json) });
        lastRemote = rec.updatedAt;
      }
    }
  });
}
