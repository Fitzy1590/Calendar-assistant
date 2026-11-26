import { useStore } from "../../store";
import { isTauri } from "../platform";
import { sqliteStorage, type SqlDb } from "./sqliteStorage";
import { useBackend, useBlobs } from "./storage";

/** Tauri: open `calendar.db` (app data folder) and load the store from it. Anything else keeps localStorage. */
export async function initStorage() {
  if (!isTauri()) return;
  try {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const raw = await Database.load("sqlite:calendar.db");
    const db: SqlDb = { execute: (s, p) => raw.execute(s, p), select: (s, p) => raw.select(s, p) };
    const sq = sqliteStorage(
      db,
      () => localStorage.getItem("calendar-assistant"),
      (e) => import("../errors").then((m) => m.recordError(e, "sqlite", false)),
    );
    useBackend(sq.storage);
    useBlobs({ get: sq.blobGet, set: sq.blobSet });
  } catch (e) {
    // SQLite unavailable: keep saving to localStorage so nothing is lost
    import("../errors").then((m) => m.recordError(e, "sqlite-open", false));
  }
  await useStore.persist.rehydrate();
}
