---
paths: ["src/lib/sync/sqliteStorage.ts", "src/lib/sync/initStorage.ts", "src/lib/sync/storage.ts", "src-tauri/capabilities/*.json"]
---

# SQLite rules

- Tauri only (`calendar.db` in the app data folder). Browser, tests and a failed open keep localStorage.
- Tables: one per collection (`id, updated_at, deleted, data JSON`), `kv` (settings, counters), `blobs` (Yjs doc). Use `?` placeholders; table names are constants.
- First run migrates the old `calendar-assistant` localStorage blob; that blob is never deleted.
- Never write before the first read (empty defaults would wipe rows). Only changed rows are written.
- Capabilities: only `sql:allow-load|execute|select|close`. No new fs scopes.
