import { isTauri } from "./platform";
import { useStore } from "../store";

/**
 * GET helper that works around CORS:
 *  - inside the Tauri app it uses the native HTTP plugin (no CORS);
 *  - in a browser it goes through the sync server's /proxy endpoint when one is configured;
 *  - otherwise it tries a direct fetch (fine for CORS-enabled APIs such as Open-Meteo).
 */
export async function httpGet(url: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    try {
      const { fetch: tfetch } = await import("@tauri-apps/plugin-http");
      return await tfetch(url, init);
    } catch (e) {
      // The native client can fail on some PCs (security software, odd proxies). Try a plain request from the
      // window instead: it works for CORS-enabled APIs (Open-Meteo, TheSportsDB…). Where the site refuses
      // that too, report the native client's original error.
      try {
        return await fetch(url, init);
      } catch {
        throw hostError(url, e);
      }
    }
  }
  const server = useStore.getState().settings.sync.serverUrl;
  if (server && !/open-meteo\.com|anthropic\.com|googleapis\.com|graph\.microsoft\.com/.test(url)) {
    const base = server.replace(/^ws/, "http").replace(/\/$/, "");
    return fetch(`${base}/proxy?url=${encodeURIComponent(url)}`, init);
  }
  return fetch(url, init);
}

/** Say which service failed, not just a bare message. */
function hostError(url: string, e: unknown) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep the raw text */
  }
  return new Error(`${host}: ${String((e as Error)?.message ?? e)}`);
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await httpGet(url, init);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

/** Tiny in-memory + sessionStorage cache so page switches feel instant. */
const mem = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    const raw = sessionStorage.getItem("c:" + key);
    if (raw) {
      const p = JSON.parse(raw);
      if (Date.now() - p.at < ttlMs) {
        mem.set(key, p);
        return p.value as T;
      }
    }
  } catch {
    /* storage unavailable */
  }
  const value = await load();
  const entry = { at: Date.now(), value };
  mem.set(key, entry);
  try {
    sessionStorage.setItem("c:" + key, JSON.stringify(entry));
  } catch {
    /* quota */
  }
  return value;
}
