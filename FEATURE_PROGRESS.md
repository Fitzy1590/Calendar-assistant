# Feature progress

Audited 2026-11-08 against `main` @ 6db1ed2 (release v0.1.2) + `CLAUDE.md`.
Package manager is **npm** (`package-lock.json`, CI runs `npm ci`); commands below use npm/npx.

**Baseline checks** (run for every item, in addition to its own check):
- `B1` `npx tsc --noEmit` exits 0
- `B2` `npm test`, all suites pass (currently 56 tests in 8 files)
- `B3` `npm run build` succeeds
- `B4` Rust touched: `rustfmt --edition 2021 --check src-tauri/src/*.rs`, plus a green GitHub `build` run (check, windows, android jobs)
- `B5` `npx prettier --check "src/**/*.{ts,tsx}"` clean

---

## 0. Email module (approved vote; design in `SPEC.md`)

Resume here after `/clear`. Work one stage at a time; tick it only when its checks pass. Every stage also needs B1-B3 and B5.
Open question for you: none blocking. Assumption to confirm: "cache message text" is on by default, with a setting for metadata-only (SPEC §0).

| | Stage | Verification |
|---|---|---|
| [ ] | **E1 Themes and density**: `oled`, `forest`, `contrast` themes; `spacious` density; accent contrast helper; Settings pickers | Unit test: every theme's text/background pairs meet AA (`contrast` AAA); Playwright screenshots of Home in each theme at 1280 px and 412 px |
| [ ] | **E2 Storage checker** (app-wide): usage estimate, 80%/500 MB warning, safe cleanup dialog, 7-day snooze | Unit tests for thresholds and the cleanup plan (never lists events/tasks/notes/contacts/settings); manual: fake a full store, dialog appears, nothing user-made is deleted |
| [ ] | **E3 Secure store + per-account auth**: Rust `secure_store_*` (Credential Manager), `secureStore.ts` with fallback, `google.ts` per-account tokens, `microsoft.ts` (PKCE loopback) | `cargo test` for the store (standalone) and green Windows CI; unit tests: refresh, `invalid_grant` → needs-reconnect, tokens absent from `localStorage`/backups/error reports |
| [ ] | **E4 Gmail adapter**: initial sync, history polling, threads, labels, send (injectable API) | Adapter tests against a fake Gmail: history 404 → resync, 429 backoff, send builds correct reply headers |
| [ ] | **E5 Graph adapter**: folder delta sync, conversation threads, reply/send | Same against a fake Graph: deltaLink resume, expired token, reply threading |
| [ ] | **E6 Mail cache** (IndexedDB): metadata always, text optional, size cap + eviction, per-account purge | Unit tests with a fake IndexedDB: eviction order, text off keeps metadata only, disconnect purges |
| [ ] | **E7 Email page**: accounts list, listbox of messages, reader (sanitised HTML, blocked remote images), keyboard + ARIA, density rows | axe-core 0 serious/critical; Playwright keyboard-only walkthrough; XSS test strings render inert; 1280 px and 412 px screenshots |
| [ ] | **E8 Thread context + summary**: `thread.ts` strip/redact/budget, confirm-before-first-send, summary cache | Unit tests: quotes/signatures stripped, codes/cards redacted, budget keeps newest 3, deadlines match `parseWhen`; confirm dialog shows exact payload |
| [ ] | **E9 Sorting**: `classify.ts` buckets, user rules, folders, drag-and-drop + "Move to…" menu | Unit tests per bucket and rule precedence; Playwright: drag a message and use the keyboard menu, same result |
| [ ] | **E10 AI drafts + voice**: Claude and Gemini cards, tones, `[CHECK:]` blocking, dictation into instruction/draft | Fake-provider tests (parallel, cancel, error on one side); test that only the Send button reaches a send API; manual dictation (Picovoice in the app, Web Speech in browser mode) |
| [ ] | **E11 Send/reply** via Gmail and Graph | Fake-API tests for threading headers; manual: reply to a real thread from each account |
| [ ] | **E12 Calendar and task actions + automatic hint** | Unit tests: event/task preview from sample emails, hint appears only for date+time+event word; conflict warning shown; nothing created without confirm |
| [ ] | **E13 Polling and notifications** (1-5 min, on focus, backoff, new-mail notification) | Fake-timer tests; manual: new mail notification arrives while the app is open |
| [ ] | **E14 Real-account verification** (Gmail and Outlook/Hotmail): connect, read, summarise, draft, send, reconnect after token loss | Manual checklist in the PR; then mock screenshots (see below) |

Backlog, not voted: IMAP/SMTP (needs native Rust), push notifications (needs a server), Whisper dictation, Cyberpunk theme, phone access to mail, LLM-refined sorting.

---

## 1. Implemented

### Date / calendar utilities (`src/lib/`)
| | Item | Verification |
|---|---|---|
| [x] | `recurrence.ts`: `occurrences`, `occurrencesInRange`, `occurrencesOnDay`; daily/weekly(byWeekday)/monthly/yearly, interval, until, count, exceptions, month-end skip | B1, B2; `npx vitest run src/lib/recurrence.test.ts` (4 tests) |
| [x] | `nlp.ts`: `parseWhen` (dates, times, durations, ranges), `parseRecurrence`, `cleanTitle`; original capitals kept | `npx vitest run src/lib/nlp.test.ts` (17 tests) |
| [x] | `birthdays.ts`: derived yearly `bday:` events, `calendarEvents()`, leap-day handling | `npx vitest run src/lib/birthdays.test.ts` (2) |
| [x] | `util.ts`: `localIso`, `fromYmd`, `ymd` (immutable, date-fns) | B1, B2 |
| [x] | `planner.ts`: `conflictsFor`, `conflictsForEvent`, `planWeek` | B1; manual: Tasks → Plan my week shows a plan |
| [x] | `reminders.ts`: `upcomingReminders`, `nextBirthday`, `dueNow` | B1; manual: Reminders page lists event/birthday/task items |

### API integrations (`src/lib/`)
| | Item | Verification |
|---|---|---|
| [x] | `weather.ts` (Open-Meteo forecast, geocoding) | B1; manual: Home shows weather after setting a suburb |
| [x] | `news.ts` (Google News RSS) / `sports.ts` (TheSportsDB) / `localEvents.ts` (Ticketmaster) | B1; manual: pages load in the Windows app |
| [x] | `google.ts`: loopback OAuth (desktop) + popup (web), Drive backup, Contacts birthdays; `googleSync.ts` Calendar two-way sync engine; `googleMap.ts` event mapping; `googleAuto.ts` automatic sync | B1; manual: Settings → Connect Google, Sync now |
| [x] | `email.ts`: Gmail, Outlook (Graph), `.ics`/pasted-email extraction, conflict detection | B1; manual: Import dialog lists candidates with conflict tags |
| [x] | `shopping.ts`: OSM store search, Claude price compare, JSON-LD price extraction, trends | `npx vitest run src/lib/shopping.test.ts` (7) |
| [x] | `sync.ts` + `server/sync-server.mjs`: LWW relay, offline queue, force sync, heartbeat, shared prefs, RSVP pages | `node --check server/sync-server.mjs`; manual: two devices, change appears on the other |
| [x] | `updates.ts`: Tauri updater (Windows) / GitHub Releases (Android) | `npx vitest run src/lib/updates.test.ts` (1) |
| [x] | `assistant.ts` / `actions.ts`: local intent parser + Claude tool use | nlp tests (routing cases in `nlp.test.ts`) |

### UI components
| | Item | Verification |
|---|---|---|
| [x] | Calendar: day / week / month / year, own-scroll time grid opening at the current time | B1; manual: Day view shows the red now-line without scrolling |
| [x] | `EventEditor`, `InvitePanel` (RSVP), `DayPanel`, `MiniCalendar`, `BirthdaySync` | B1; manual flows in README |
| [x] | Tasks board, Notes, Shopping, Contacts, Reminders, News, Sports, Settings (search), Wizard (skippable) | B1, B3 |
| [x] | "What's new" window after an update (Windows): `lib/whatsNew.ts` entries, `components/WhatsNew.tsx`; Settings → Updates → What's new reopens it; new installs skip it | `npx vitest run src/lib/whatsNew.test.ts` (5); manual: lower `settings.updates.lastSeenVersion`, restart, window shows once |
| [x] | Errors: `ErrorBoundary`, `ErrorAlert`, Diagnostics, auto-fix (`autofix.ts`); Rust crash dialog, WebView2 repair, browser mode | B1, B4; manual: corrupt localStorage → restored from snapshot |

---

## 2. Active work

| | Item | Verification |
|---|---|---|
| [x] | **Google Calendar sync: reliable, one-click, automatic.** Incremental sync (sync token; full resync if Google drops it); deletions in Google removed here; deleted/moved single occurrences ↔ `EXDATE` and exceptions; no echo of pulled events; one failed event no longer stops the rest; duplicate copies merged safely; **Sync with Google Calendar** button (sign in + enable + sync); auto sync on open, on focus and every 5/15/30/60 min | `npx vitest run src/lib/googleSync.test.ts` (11, against a fake in-memory Google) and `googleMap.test.ts` (9); B1–B3, B5 |
| [ ] | **Google sync: attendees.** Invite guests aren't sent to / read from Google events | Unit test for mapping `attendees[]` ↔ Google `attendees`; B1, B2 |
| [ ] | **Real-account verification** of Google Calendar sync (create, edit, delete on both sides; delete one occurrence of a repeating event; run **Sync with Google Calendar** twice: no duplicates, second run "0 in, 0 out") | Manual checklist in PR |
| [x] | **Harness setup**: `.claude/settings.json` (deny `.env`, `.env.local`, `*.key`, `*.jks`, `client_secret*.json`; Prettier PostToolUse hook; `tsc` Stop hook), `.prettierrc.json`, `.claude/rules/calendar-ui.md`, `.claude/skills/calendar-api/SKILL.md` | `jq -e . .claude/settings.json`; `npx prettier --check "src/**/*.{ts,tsx}"`; Stop hook exits 2 on a type error |

---

## 3. Backlog

### Date picker and time grid keyboard accessibility
| | Item | Verification |
|---|---|---|
| [ ] | Month cells, time-grid columns, day headers, `.pill` and `.ev` items are clickable `<div>`s (`pages/Calendar.tsx`): make them `<button>`s or add `role="gridcell"` + `tabIndex` + Enter/Space handlers | Playwright: Tab reaches each event; Enter opens the editor; no `div[onClick]` without `role` (grep check in CI) |
| [ ] | Arrow-key grid navigation in `MiniCalendar` and month view (roving `tabIndex`; ←/→ day, ↑/↓ week, PgUp/PgDn month, Home/End week) | Playwright keyboard test asserts focused date after each key |
| [ ] | Time-slot creation by keyboard (focusable slots, Enter creates event at that time) | Playwright: focus 14:00 slot, Enter, editor shows 2:00 PM |
| [ ] | Visible focus ring on every interactive calendar element (`:focus-visible` uses `--accent`, 2px) | Screenshot check in both themes |

### ARIA / screen readers
| | Item | Verification |
|---|---|---|
| [ ] | Month view `role="grid"` with `aria-label="November 2026"`; cells labelled "Tuesday 10 November, 2 events" | axe-core (Playwright) on Calendar: 0 serious/critical violations |
| [ ] | Events announce title, time, location (`aria-label` on `.ev`/`.pill`) | axe + manual NVDA/TalkBack pass |
| [ ] | Live region for toasts and assistant replies (`role="status"` present on toast; add `aria-live="polite"` to chat) | axe; DOM assertion in test |
| [ ] | Icon-only buttons all have `aria-label` | grep check: `btn.*icon` without `aria-label` returns nothing |

### OAuth token handling
| | Item | Verification |
|---|---|---|
| [ ] | Move Google refresh token out of `localStorage` (`google.ts` `REFRESH_KEY`) into OS secure storage (Windows Credential Manager via a Tauri command / keyring crate) | Rust unit test for store/read/delete; token absent from `localStorage` after connect |
| [ ] | Outlook: loopback OAuth in the installed app (currently popup only) | Manual: Outlook scan works in the Windows build |
| [ ] | Handle revoked/expired refresh tokens (invalid_grant → clear token, show "Reconnect Google") | Unit test mocking token endpoint 400 `invalid_grant` |
| [ ] | Never log tokens; redact in `errors.ts` reports | Unit test: `reportUrl()` output contains no `ya29.`/`Bearer` |

### Notification triggers
| | Item | Verification |
|---|---|---|
| [ ] | Reminders fire only while the app is open (30 s poll in `App.tsx` → `dueNow`). Schedule OS notifications ahead of time (Tauri notification `schedule` on Android; tray process on Windows) | Android: reminder fires with the app closed; unit test for the scheduling plan built from `upcomingReminders` |
| [ ] | Reschedule on change (event edited/deleted, reminder settings toggled, synced change) | Unit test: editing an event replaces its scheduled notification |
| [ ] | Actionable notifications: Snooze / Done / Open | Manual on Android and Windows |
| [ ] | Missed-while-off digest on next launch | Unit test for `dueNow` with a 6 h window |

---

## 4. Definition of done (every item)
1. B1–B3 and B5 pass locally; B4 if Rust or CI changed.
2. New logic has unit tests next to it (`src/lib/*.test.ts`); count in this file updated.
3. UI change checked in `npm run dev` at desktop and 412 px width, light and dark.
4. Item ticked here and README updated if user-visible.
5. After a feature is published to the repo, show the user mock screenshots of it (desktop and phone width).
