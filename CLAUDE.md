# Calendar Assistant

Planner app: calendar, tasks, notes, shopping, contacts, reminders, weather, news, sports, voice assistant.
One React + TypeScript codebase, packaged with Tauri 2 as a **Windows** app and an **Android** app, plus a
small Node **sync server**. Progress and open work: `FEATURE_PROGRESS.md`.

## Commands (npm: the repo and CI use package-lock.json)

```bash
npm install                # deps
npm run dev                # browser preview, http://localhost:1420
npm test                   # vitest (unit tests live next to the code: src/lib/*.test.ts)
npx tsc --noEmit           # type check (must be clean before finishing)
npx prettier --check "src/**/*.{ts,tsx}"   # formatting (Claude hook auto-formats edited files)
npm run build              # tsc + vite build -> dist/
npm run sync-server        # sync relay + RSVP pages on :8787
npm run win:dev / win:build             # Tauri desktop (needs Rust; builds on Windows)
npm run android:init / android:build    # Tauri Android (needs SDK + NDK)
```

Rust (`src-tauri/`) can't be fully built in Linux CI-less sandboxes (no WebView2/webkit). Check pure
modules standalone (copy into a scratch crate, `cargo test`) and rely on the GitHub `build` workflow
(Windows + Android jobs) for the rest. `rustfmt --edition 2021 src-tauri/src/*.rs`.

## Layout

```
src/
  main.tsx          start-up order: error capture -> sync -> phone bridge -> voice -> updates
  App.tsx           shell, theme, background jobs, per-page ErrorBoundary
  store.ts          Zustand + persist: collections, settings, UI state, upsert/remove/applyRemote
  types.ts          every data shape (CalEvent, Task, Note, ShoppingItem, Contact, Settings…)
  pages/            one screen per file (Calendar, Tasks, Notes, Shopping, Settings, Wizard…)
  components/       shared UI; ui.tsx has Modal, Toggle, Seg, PageHead, Field
  lib/              all logic and every outside service (see below)
src-tauri/src/      lib.rs (startup, plugins, tray), crash.rs, webview_fix.rs, browser_mode.rs
server/             sync-server.mjs: WebSocket relay, RSVP pages, CORS/price proxy
scripts/ docs/ .github/workflows/build.yml   versioning, setup guides, CI + releases
```

## Architecture

- **Services are modules in `src/lib/`**, one per outside system: `weather.ts` (Open-Meteo), `news.ts`
  (Google News RSS), `sports.ts` (TheSportsDB), `localEvents.ts` (Ticketmaster), `google.ts` (OAuth,
  Calendar, Drive, Contacts), `email.ts` (Gmail/Outlook/.ics), `shopping.ts` (OpenStreetMap, Claude
  web search, price pages), `sync.ts` (relay). They return plain typed objects, never touch React.
  New integrations follow the same shape; route network calls through `lib/http.ts` (`httpGet`,
  `getJson`, `cached`) so CORS works in Tauri, browser mode and the browser build.
- **One command surface:** `lib/actions.ts`. Buttons, the local intent parser (`lib/assistant.ts`
  `runLocal`) and Claude tool calls (`runClaude`) all call these. Add a feature's actions here first.
- **Platform differences** go through `lib/platform.ts` (`isTauri`, `isAndroid`, `isBrowserMode`,
  `openUrl`, `notify`). Don't branch on user agent elsewhere.
- **Drive sync** (no server): `lib/driveSync.ts` is the engine (one file per device in Drive's hidden app folder, newest edit wins,
  injected `DriveApi`/`LocalState` so it is tested with fakes); `lib/driveSyncApp.ts` wires Drive, the store and triggers. See `docs/DRIVE_SYNC.md`.
- **Sync:** records are `Synced` (`id`, `updatedAt`, `deleted`). Last writer wins per record; deletes are
  tombstones. `store.upsert` / `store.remove` notify `sync.ts`; remote changes arrive via `applyRemote`.
- **Settings** are per device; a subset (`SHARED_KEYS` in `sync.ts`) syncs as the `prefs/shared` record.
  New settings need a default in `DEFAULT_SETTINGS` (store.ts); `merge` back-fills old saves.

## Email module (in progress: see `SPEC.md`, stages in `FEATURE_PROGRESS.md`)

- Code: `src/lib/mail/` built: `graph.ts` (Outlook adapter, injected API), `microsoft.ts` (sign-in), `classify.ts` (buckets +
  importance), `rules.ts` (your rules, suggestions), `bills.ts` (amount/due date), `cache.ts` (IndexedDB), `engine.ts` (sync, alerts, bills, summary); planned: `gmail.ts`, `thread.ts`, `drafts.ts`
  (Claude/Gemini). Page `src/pages/Email.tsx`, parts in `src/components/mail/`. Sign-in setup: `docs/EMAIL_SETUP.md`.
- Never run Prettier on `styles.css` (it is excluded; it would rewrite the whole file).
- Mail is **not** a store collection: bodies live in IndexedDB on this device only (never synced, never in backups).
  Account metadata is in `settings.mail`; **tokens only in the OS secure store** (`lib/secureStore.ts`), never settings or logs.
- Never mutate a thread or message object; build new ones. Sanitise HTML before rendering. AI drafts are draft-only: nothing is
  sent without an explicit Send press. Trim and redact a thread locally before it goes to Claude or Gemini.
- Token hygiene for sessions: keep this file under 200 lines, search the repo with subagents, `/clear` near 80% context and
  resume from `FEATURE_PROGRESS.md`.

## Dates and events (immutable)

- Library: **date-fns** only. Local wall-clock strings: `"yyyy-MM-ddTHH:mm"` (`localIso`, `fromYmd`,
  `ymd` in `lib/util.ts`). All-day events run midnight to next midnight.
- **Never mutate a record you got from the store** (events, tasks, notes…). Write changes with
  `store.upsert("events", { id, ...patch })`, which creates a new object and stamps `updatedAt`. Mutating
  in place skips sync and React updates.
- Recurring events are stored once with `recurrence` + `exceptions`. Expand them with the pure functions in
  `lib/recurrence.ts` (`occurrences`, `occurrencesInRange`, `occurrencesOnDay`); never write occurrences
  back. Deleting one occurrence = add its date to `exceptions`.
- Birthdays are **derived**, not stored: `calendarEvents()` in `lib/birthdays.ts` adds `bday:<contactId>`
  yearly events. Use it (not `live(events)`) anywhere the calendar is drawn or searched; edit the contact,
  never the virtual event.
- Natural-language dates: `lib/nlp.ts` (`parseWhen`, `parseRecurrence`). Matching is lower-case; titles keep
  the original capitals. Add a test in `nlp.test.ts` for any new phrase.

## Gotchas

- `updateSettings(fn)` passes a **structuredClone draft**: mutating that draft is the intended pattern.
  That's the only place mutation is OK.
- Hooks: `useStore(selector)`; effects that subscribe must return cleanup functions (some DOM APIs return
  Promises; wrap in braces so an effect never returns a non-function).
- Persisted state: bump nothing silently. Adding a collection = add it to `State`, `partialize`, `merge`,
  `backup.ts` `COLLECTIONS`, and `sync.ts` `allLocalChanges`.
- Secrets (Anthropic key, Picovoice key, Google desktop secret) live only in settings on the device and
  are blanked in backups (`backup.ts makeBackup`). Never log them or put them in the repo.
- Errors: unhandled ones go through `lib/errors.ts` (plain-English explanation) and `lib/autofix.ts`
  (safe automatic fixes). Auto-fixes must never delete user data or change OS settings without asking.
- UI: follow `.claude/rules/calendar-ui.md` (tokens in `styles.css`, accessible controls, no AI-slop look).
- Google/Outlook sync and OAuth details: `.claude/skills/calendar-api/SKILL.md` and
  `docs/GOOGLE_AND_OUTLOOK.md`.

## Before finishing a change

1. `npx tsc --noEmit` clean, `npm test` passing, `npm run build` succeeds, Prettier check clean.
2. UI change: run the app (`npm run dev`) and look at it at desktop and phone width.
3. Rust change: `rustfmt`, standalone `cargo test` for pure modules, then watch the GitHub `build` run.
4. Update `FEATURE_PROGRESS.md` and the README if behaviour users see changed.

## Releases

Merging to `main` then pushing a `release/vX.Y.Z` branch (or Actions → build → Run workflow with a
version) builds Windows + Android and publishes a GitHub Release. See `docs/RELEASING.md`.
After a feature is fully published to the repo, show the user mock screenshots of it (Playwright, 1280 px and 412 px).
Before each release add an entry to `src/lib/whatsNew.ts` (the post-update "What's new" window).
