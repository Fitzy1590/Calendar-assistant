import { useStore, DEFAULT_SETTINGS } from "../store";
import { forceSync } from "./sync";
import { listSnapshots, restoreBackup, snapshotJson } from "./backup";

/**
 * Automatic fixes for errors. Each fix is safe to run without asking: it never deletes your events,
 * tasks, notes, contacts or shopping items, and never changes Windows settings (those still ask).
 * Returns a short "what I did" message, or null if there's nothing automatic to try.
 */

const once = (key: string, withinMs: number) => {
  try {
    const last = Number(sessionStorage.getItem(`autofix:${key}`) || 0);
    if (Date.now() - last < withinMs) return false;
    sessionStorage.setItem(`autofix:${key}`, String(Date.now()));
  } catch {
    /* no session storage: allow */
  }
  return true;
};

export async function autoFix(err: unknown): Promise<string | null> {
  const msg = String((err as Error)?.message ?? err ?? "");

  // Part of the app failed to load (usually right after an update): reload once.
  if (/Loading chunk|dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg) && once("reload", 60_000)) {
    setTimeout(() => location.reload(), 600);
    return "Reloading the app to finish loading the latest version.";
  }

  // Out of storage: free space without touching your data.
  if (/QuotaExceeded|quota|storage.*full/i.test(msg) && once("prune", 30_000)) {
    const freed = pruneStorage();
    return freed ? `Freed space by clearing ${freed}. Your events, tasks and notes weren't touched.` : null;
  }

  // Connection problems: catch up as soon as the connection is back.
  if (/Failed to fetch|NetworkError|Load failed|ERR_INTERNET|network/i.test(msg)) {
    if (once("online-wait", 60_000)) {
      if (navigator.onLine) setTimeout(() => forceSync(), 3000);
      else window.addEventListener("online", () => forceSync(), { once: true });
    }
    return navigator.onLine
      ? "Will retry the connection in a moment."
      : "You're offline. Changes are saved and will sync when you're back online.";
  }

  // Sync trouble: a full catch-up usually clears it.
  if (/sync|websocket/i.test(msg) && once("sync", 60_000)) {
    forceSync();
    return "Restarted sync.";
  }
  return null;
}

/** Free storage: caches, old snapshots, long price histories, the error log, very old deletion markers. */
export function pruneStorage(): string {
  const done: string[] = [];
  try {
    sessionStorage.clear();
    done.push("cached news and weather");
  } catch {
    /* ignore */
  }
  try {
    const snaps = JSON.parse(localStorage.getItem("snapshots") || "[]");
    if (snaps.length > 3) {
      localStorage.setItem("snapshots", JSON.stringify(snaps.slice(0, 3)));
      done.push(`${snaps.length - 3} older backups (the newest 3 are kept)`);
    }
    localStorage.removeItem("error-log");
  } catch {
    /* ignore */
  }
  const st = useStore.getState();
  let trimmed = 0;
  for (const item of Object.values(st.shopping)) {
    if (item.track && item.track.history.length > 60) {
      const record = { ...item, track: { ...item.track, history: item.track.history.slice(-60) } };
      st.applyRemote([{ collection: "shopping", record }]);
      trimmed++;
    }
  }
  if (trimmed) done.push(`old price history on ${trimmed} item${trimmed > 1 ? "s" : ""}`);
  return done.join(", ");
}

/**
 * A page crashed while drawing. Most often a customisation it doesn't expect: put that page's layout
 * settings back to the defaults (your data is untouched) so it can be tried again.
 */
export function resetPageLayout(page: string): string | null {
  const s = useStore.getState();
  const pages = DEFAULT_SETTINGS.pages as Record<string, unknown>;
  if (page === "app") {
    s.updateSettings((st) => {
      st.pages = structuredClone(DEFAULT_SETTINGS.pages);
      st.sidebar = structuredClone(DEFAULT_SETTINGS.sidebar);
    });
    s.setPage("home");
    return "Reset page layouts and the menu to their defaults.";
  }
  if (!(page in pages)) return null;
  s.updateSettings((st) => void ((st.pages as Record<string, unknown>)[page] = structuredClone(pages[page])));
  return `Reset the ${page} page's layout to its default.`;
}

/** Saved data couldn't be read at start-up: restore the newest daily snapshot that has data in it. */
export function restoreFromSnapshot(): string | null {
  for (const snap of listSnapshots()) {
    const json = snapshotJson(snap.at);
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as { data?: Record<string, unknown[]> };
      const records = Object.values(parsed.data ?? {}).reduce((n, list) => n + (list?.length ?? 0), 0);
      if (!records) continue; // an empty snapshot (taken after the damage) would restore nothing
      return restoreBackup(json, { settings: true });
    } catch {
      /* damaged snapshot: try the next one */
    }
  }
  return null;
}
