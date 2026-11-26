# Feature progress

Audited 2026-11-08 against `main` @ 6db1ed2 (release v0.1.2) + `CLAUDE.md`.
Package manager is **npm** (`package-lock.json`, CI runs `npm ci`); commands below use npm/npx.

## Checkpoint (2026-11-11): resume here after `/clear`

**Where things are**
- Released: **v0.2.4** (Hotmail on Android, Save-window backups). **v0.2.5**: browser mode opens the browser not File Explorer (`crash::open` uses ShellExecute), WebView2 panics show the WebView2 options, group-policy block (0x800704EC) offers browser mode, `httpGet` retries a failed native request from the window. What's new entry is 0.2.5. **v0.2.6**: mail reader toolbar above the subject + readable text (`lib/mail/readable.ts`), Tasks week board (double-click a day to add, drag cards between days), today highlighted in Tasks/Calendar, left menu can be minimised. What's new entry is 0.2.6. **v0.2.7** (this release): Tasks board drag uses pointer events (HTML5 drag-and-drop failed in the Tauri webviews), touch handle, Alt+Left/Right moves a card, card text wraps at spaces. What's new entry is 0.2.7.
- Untested: Android sign-in, Android Save/write to a content URI, Rust build (CI decides). Android refresh token sits in app-private localStorage.
- NEXT: open a PR, watch the `build` run, then merge + release v0.2.4 only on the user's word (workflow_dispatch on main, release_version 0.2.4), notify, screenshots.

**Decisions made (don't re-ask)**
- npm, not pnpm. Logic in `src/lib`, screens in `src/pages`. Never Prettier `styles.css`.
- Drive sync uses `drive.file` + a "Calendar Assistant (sync)" folder (device flow rejects `drive.appdata`).
- Email folders live in the app only; the real mailbox is never changed. Sending allowed from Outlook, Gmail and SMTP accounts.
- AI drafts are draft-only; first use of each AI shows the exact text sent. Keys stay on the device and out of backups.
- Windows updates: direct installer with GitHub SHA-256 check; `scripts/setup-updates.mjs` sets up signed updates.
- Full screen = borderless maximised window; taskbar hiding is opt-in.
- Microsoft token and device-code requests run natively (`oauth_proxy.rs`): the web view adds an Origin header (AADSTS90023).
- Voting cards with mock screenshots for UX choices; mock screenshots after each release; merge/release only when asked.

**Not verified against real services** (say so in summaries): Gmail read/send, IMAP/SMTP (Bigpond), Outlook send, Claude/Gemini with real keys, taskbar-hiding full screen, Drive sync PC<->phone, Android Hotmail sign-in and file save.

---

**Baseline checks** (every item): `npx tsc --noEmit`; `npm test` (335 tests); `npm run build`; Rust touched: `rustfmt --edition 2021 --check src-tauri/src/*.rs` + green GitHub `build` run; `npx prettier --check "src/**/*.{ts,tsx}"`.

---

## 0. Email module (approved vote; design in `SPEC.md`)

Resume here after `/clear`. Work one stage at a time; tick it only when its checks pass. Every stage also needs B1-B3 and B5.
Open question for you: none blocking. Assumption to confirm: "cache message text" is on by default, with a setting for metadata-only (SPEC §0).

| | Stage | Verification |
|---|---|---|
| [x] | **UI refresh (voted)**: Midnight, Ember, Graphite, Nord themes; picker grouped Light/Dark with live mini previews; accents trimmed to Ink blue, Violet, Mulberry, Slate; top navigation bar on desktop (labels collapse to icons below 1400 px; bottom bar on phones unchanged); `--radius` 10 px | `themes.test.ts` covers the new themes (AA); Playwright screenshots at 1280 px and 412 px |
| [x] | **Tasks page refresh (voted)**: round checkboxes, priority as a coloured bar (high red, normal amber, low grey), due date in plain words (tap to change, `lib/dueLabel.ts`), round + button opens an add box, finished tasks hidden behind "N done today · Show", Delete on hover or focus (swipe left on phones); Week plan stays the default | `dueLabel.test.ts`; Playwright screenshots at 1280 px and 412 px, swipe-to-delete exercised on an emulated touch phone |
| [x] | **Notes page refresh (voted)**: flat tinted cards with a colour bar (no tilt or shadow), colours softened toward each theme, round + button opens a New note box (voice dictation kept); board, checkbox lines, filter row, Pinned section and footer buttons unchanged | `themes.test.ts` (note text and muted text stay AA on every note colour in every theme); Playwright screenshots at 1280 px and 412 px, add-note flow exercised |
| [x] | **Shopping page refresh (voted)**: item actions (Find, Track, Delete) show on hover or focus and by swiping a row left on phones; subtotal in each shop heading instead of one grand total (items whose price is only being tracked are left out); Bought is a collapsed line that opens on tap; tabs, add bar, shop cards, stacked Find results and tracking cards unchanged | Playwright screenshots at 1280 px and 412 px; swipe, Delete and the Bought toggle exercised on an emulated touch phone |
| [x] | **Email page refresh (voted)**: one layout (folder chips on top; the Tabs on top / Classic switch is gone, `settings.mail.layout` is kept but no longer read), Bills is a folder chip, unread rows tinted, round + for New email, small refresh icon for Sync, Draft with Claude/Gemini and quick replies live in the reply window only, phones open a message full screen with a Back button | Playwright screenshots at 1280 px and 412 px using made-up sample mail seeded into the IndexedDB cache; phone open and Back exercised |
| [x] | **Home page refresh (voted)**: card titles in sentence case with a count and a "See all →" link; one-line summary under the greeting (`lib/homeSummary.ts`: events today, tasks due, bills); Customise now has "Rearrange cards", an edit mode where each card has a drag handle (pointer drag, or focus the handle and press the arrow keys, with a spoken position) and a Done button (Esc also finishes); weather and clock cards, three-column grid, empty cards and no quick add unchanged | `homeSummary.test.ts`; Playwright screenshots at 1280 px and 412 px; real mouse drag and keyboard move exercised |
| [x] | **News, Sports, Subscriptions, Settings refresh (voted)**: News has a lead story plus a list, source and time always shown (the "Show source & time" switch is gone, the stored setting is unused), underlined topic tabs with a + that opens the topic chooser, and a search icon in the header; Sports picks a team or sport from a drop-down, has a small "Add games to my calendar" switch, a team page with a Next/Last summary and Upcoming/Results tabs, and game rows with a date block; Subscriptions shows one total line with a category bar (`categoryShares`), a ▲/▼ badge for price changes, and a "…" menu (`ui.tsx` `Menu`) holding "Not a subscription"; Settings sections are cards, and phones show a section list first, then one section with a Back button | `subscriptions.test.ts` (category shares); Playwright screenshots at 1280 px and 412 px with stand-in news, fixtures and subscriptions; search icon, "Not a subscription" menu and the phone section list and Back exercised |
| [x] | **E1 Themes and density**: `oled`, `forest`, `contrast` themes (plus 4 existing); `spacious` density; accent contrast helpers (`lib/themes.ts`: readable text on accent buttons, text-safe accent per theme); Settings pickers | `npx vitest run src/lib/themes.test.ts` (21): every theme meets AA text/muted/status contrast (AAA for contrast), accents readable on every surface; Playwright screenshots of Home/Settings in the new themes at 1280 px and 412 px (done, shown after publishing) |
| [ ] | **E2 Storage checker** (app-wide): usage estimate, 80%/500 MB warning, safe cleanup dialog, 7-day snooze | Unit tests for thresholds and the cleanup plan (never lists events/tasks/notes/contacts/settings); manual: fake a full store, dialog appears, nothing user-made is deleted |
| [~] | **E3 Secure store + auth**: DONE: Rust `secure_store_*` (Credential Manager, long tokens split into chunks), `secureStore.ts` with fallback, `microsoft.ts` (PKCE loopback sign-in, refresh, `invalid_grant` → "Sign in again"). NOT DONE: Google per-account tokens (Gmail) | `cargo test` for the store logic standalone (6, passing) and the Windows CI job; `microsoft.test.ts`, `engine.test.ts`; real Outlook sign-in untested until a Microsoft app ID is added |
| [~] | **E4 Gmail adapter**: DONE: read-only (gmail.readonly), first sync of 30 days, history polling, 404 → resync, archived/spam leave the Inbox, Add Gmail button (`lib/mail/gmail.ts`, provider layer `provider.ts`/`providers.ts`/`accounts.ts`). NOT DONE: threads, labels, send, 429 backoff | `gmail.test.ts` (9), `headers.test.ts` (3) against a fake Gmail; real Gmail untested |
| [~] | **E4b Other email (IMAP)** (added on request, for Bigpond/Telstra, Yahoo, iCloud…): read-only Inbox over TLS in Rust (`imap_core.rs`), provider presets, password in the secure store, read-state and delete detection | Rust: 10 standalone tests (planning, dates, parsing); `imap.test.ts` (8) with a fake native layer; NOT verified against a real server |
| [~] | **E5 Graph adapter** (Outlook): DONE: read-only inbox delta sync, list headers via `$batch`, message text. NOT DONE: reply/send (needs Mail.Send) | `graph.test.ts` (5) against a fake Graph: paging, delta resume, deletions, expired bookmark, header failure |
| [x] | **E6 Mail cache** (IndexedDB): metadata always, text optional, size cap with oldest-first eviction, per-account purge | `cache.test.ts` (6) with fake IndexedDB |
| [~] | **E7 Email page**: DONE: folders, message listbox (keyboard j/k/arrows/Home/End), reader with plain text, "why it is here", responsive. NOT DONE: HTML rendering/sanitising (text only for now), axe-core run, "Move to…" | Playwright screenshots at 1280 px and 412 px (done); axe-core not yet run |
| [ ] | **E8 Thread context + summary**: `thread.ts` strip/redact/budget, confirm-before-first-send, summary cache | Unit tests: quotes/signatures stripped, codes/cards redacted, budget keeps newest 3, deadlines match `parseWhen`; confirm dialog shows exact payload |
| [~] | **E9 Sorting**: DONE: `classify.ts` buckets and importance; **your own rules** (sender/domain + subject keywords, any/all; actions important / always notify / mute / send to Bills), one-click sender rules and "just this email" overrides from the reader, a rules editor in Settings with a live match count, rule suggestions after 3 manual changes. NOT DONE: folders and drag-and-drop | `rules.test.ts` (12), `classify.test.ts` (17), `engine.test.ts` (rule/override cases) |
| [ ] | **E10 AI drafts + voice**: Claude and Gemini cards, tones, `[CHECK:]` blocking, dictation into instruction/draft | Fake-provider tests (parallel, cancel, error on one side); test that only the Send button reaches a send API; manual dictation (Picovoice in the app, Web Speech in browser mode) |
| [ ] | **E11 Send/reply** via Gmail and Graph | Fake-API tests for threading headers; manual: reply to a real thread from each account |
| [ ] | **E12 Calendar and task actions + automatic hint** | Unit tests: event/task preview from sample emails, hint appears only for date+time+event word; conflict warning shown; nothing created without confirm |
| [~] | **E13 Polling and notifications**: DONE: 1-15 min polling, on open and on focus, desktop alert for new important mail (never the first-sync backlog), unread menu badge, daily summary, Home "Important mail" card, "what counts as important" and alert settings. NOT DONE: backoff on 429 | `engine.test.ts` (17) incl. alerts, no alerts for junk/subscriptions/old mail, summary once a day; real notification on real mail untested |
| [x] | **E15 Bills** (added on request): Bills tab (unpaid/paid), amount and due date read from the email (preview and body), overdue/due-soon labels, **Mark as paid** / undo (kept locally), Add to Calendar (all-day event), Add as task, Not a bill, reminders N days before due (once per bill) | `bills.test.ts` (10), `engine.test.ts` (bills: parse from body, sort by due date, paid survives resync, calendar/task links, reminders once, off switch); screenshots at 1280 px and 412 px |
| [ ] | **E14 Real-account verification** (Gmail and Outlook/Hotmail): connect, read, summarise, draft, send, reconnect after token loss | Manual checklist in the PR; then mock screenshots (see below) |

Backlog, not voted: IMAP/SMTP (needs native Rust), push notifications (needs a server), Whisper dictation, Cyberpunk theme, phone access to mail, LLM-refined sorting.

---

## Email: HTML view + calm colour (from the two voting cards, Nov 2026)
- Done: emails open as HTML in a sandboxed frame (`lib/mail/html.ts`, `components/mail/RichBody.tsx`); Gmail and Outlook only, IMAP stays plain text (needs `imap_core.rs` to return the HTML part: not done). Rich / Plain toggle; setting for pictures (Always show = the owner's choice, Trusted senders, Blocked) with a Show pictures bar and "Always show for <sender>"; links open via `openUrl`; HTML cached on this device only, same rule as text (`MailMessage.html`, `""` = no HTML version).
- Done: calm colour by type (layout A from the vote): `--k-*` tokens per theme, coloured folder tabs, type label on rows, pill in the reader. Votes: A "Love it", C and E not chosen, F "No", calm over bold.
- Fixed after v0.3.3 (reported by the owner, "ResizeObserver loop" banner): an email with `min-height:100vh` made the frame and the message chase each other. The cleaner now drops vh/vmin/vmax lengths, the frame is sized from the body on the next frame and capped, and the global error banner ignores that browser notice. Reproduced and re-checked in the real app. Ships as 0.3.4 once the owner says so.
- Not done / unverified: real Gmail and Outlook HTML (only tested with seeded mail and unit tests), the phone layout on a real device, IMAP HTML, What's new entry (add at release), the high-contrast theme's AAA (type colours measured at 7:1 or more on its black, pill tints not measured). Type colours measured: 4.5:1 or more on all light surfaces, 5.7:1 or more on the dark ones.

## Weather: humidity per day (Nov 2026, on the dev branch, not released)
- Done: average daily humidity (from Open-Meteo's hourly `relative_humidity_2m`) shown next to the temperature in the month cells, the week/day column headers, the Home forecast strip and today line, the day panel and the assistant's weather reply. Phone sizes stack it under the temperature. Checked in the real app with a synthetic forecast (the sandbox can't reach Open-Meteo): not seen with the live service.

## 0b. Drive sync (approved vote; design in `docs/DRIVE_SYNC.md`)

Windows side and the shared engine first; Android joins next. Every stage also needs B1-B3 and B5.

| | Stage | Verification |
|---|---|---|
| [x] | **D1 Engine** (`driveSync.ts`): one file per device, pull only changed peer files, newest edit wins, deletes kept 180 days, defensive file parsing, consistency check that re-applies dropped records, per-peer "matches" status | `driveSync.test.ts` (14) with a fake Drive and two fake devices: merge, newest wins, delete propagates, no re-download/re-upload when unchanged, bad/malicious files skipped, repair, peer in-sync flag |
| [x] | **D2 Windows wiring** (`driveSyncApp.ts`): real Drive calls (Drive folder, drive.file), store adapter, sync on open/focus/interval/20 s after a change, one-click connect | `driveSyncApp.test.ts` (2) against the real store: peer event lands, newer local edit survives, no API key in the file |
| [x] | **D3 Freshness**: "Last synced" in Settings, "may be out of date" bar with Sync now, stale limit setting, sidebar Sync now also runs Drive | `freshness`/`ageLabel` tests; screenshots at 1280 px and 412 px |
| [~] | **D4 Android sign-in**: DONE: device-code flow (`googleDevice.ts`, Drive app folder permission only), refresh and revoked-sign-in handling, client ID/secret fields (device-only, kept out of backups), code dialog, sign out. NOT DONE: tried on a real phone and with real Google | `googleDevice.test.ts` (7): pending/slow_down/denied/expired/cancel/timeout, refresh, invalid_grant; screenshot at 412 px; manual on a phone |
| [~] | **D5 Android sync triggers**: DONE: on open, on return to front, on a timer while running, ~20 s after a change (same engine as Windows). NOT DONE: sync while the app is closed (native WorkManager, 15 min minimum) | Manual on a phone |
| [x] | **D7 In-app setup guides** (added on request, for non-technical users): step-by-step Google (PC / phone) and Outlook guides with buttons that open the exact pages, in the setup wizard and in Settings (Google, Drive sync, Outlook) | `setupGuides.test.ts` (12): every link is https on a known site, every button a step mentions exists in a real screen; screenshots at 1280 px and 412 px |
| [ ] | **D6 Real two-device check**: Windows + a second device (a second Windows profile works) on one Google account: edit on each, delete, offline then back; read the freshness bar | Manual checklist in the PR |

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

## Updates, full screen and Sports calendar (v0.2.0)

| | Item | Verification |
|---|---|---|
| [x] | **Auto-install updates (Windows, no key needed)**: `chooseDownload` picks the installer + GitHub's SHA-256; Rust `self_update.rs` downloads, checks, runs `/P /UPDATE /R`, exits; installs at launch only, later checks prompt. `scripts/setup-updates.mjs` makes the signed-update key | `updates.test.ts` (3 new), Rust `self_update_core.rs` 3 standalone tests; real update untested until the next release after this one |
| [x] | **Full screen**: top-bar button and F11, Esc leaves (title bar hidden natively) | manual on Windows |
| [x] | **Opens on Home**; Sports menu collapsed by default | manual |
| [x] | **Sports: upcoming games** calendar (week/month), list view, team filter, day detail + Add to calendar (`lib/fixtures.ts`, `SportsUpcoming.tsx`) | `fixtures.test.ts` (5); screenshots |
| [x] | **Full screen reworked**: borderless window sized to the monitor (optionally leaving the taskbar), instead of the system full screen mode that misplaced the mouse on a rotated display; Esc/F11 leave, a toast says so | manual on Windows (rotated display); not verifiable here |
| [x] | **Drag to reorder the left menu** (+ Alt+Up/Down); `lib/order.ts` | `order.test.ts` (3); browser drag test; screenshots |
| [x] | **Sports fixtures hidden from Tasks** (`taskBoardEvents`) | `taskBoard.test.ts` |
| [x] | **Sports auto-fill calendar**: games of followed teams are added (id `sports:<gameId>`, no duplicates, moved games updated, deleted ones stay deleted) on app open, window focus, every 30 min and after a Drive sync; Sports-page switch "Add games to my main calendar" (`pages.sports.autoCalendar`, default on) (`lib/sportsCalendar.ts`) | `sportsCalendar.test.ts` (5) |
| [x] | **Keyboard shortcuts**: F toggles full screen; 1-9 and 0 open the matching left-menu item (numbers shown beside each item, follow your order); ignored while typing or in a dialog | `shortcuts.test.ts` (3); browser key test; screenshot |
| [x] | **Email folders (in-app)**: right-click menu, "Create rule + new folder", move by hand, rules can file into a folder, folder chips, Settings folder manager; mailbox never changed | `rules.test.ts` (4), `classify.test.ts` (3); screenshots (menu, dialog, folder view) |
| [x] | **IMAP connection guide**: error → plain-English steps and links; tries alternate servers; raw text under "Technical detail" | `imapHelp.test.ts` (5); screenshot |
| [~] | **Reply, forward, new email, send** (Outlook Graph `reply/replyAll/forward/sendMail`, Gmail `messages.send`, SMTP in Rust `smtp_core.rs`), outbox with Undo and Send later (IndexedDB), check before sending, attachments, templates and signatures, customisable right-click menu | `compose.test.ts` (12), `rfc822.test.ts` (4), `send.test.ts` (9), `outbox.test.ts` (4), `menu.test.ts` (5); Rust SMTP 3 standalone tests; browser run-through (menu, AI draft, `[CHECK:]` blocks Send, undo). NOT verified against real Outlook/Gmail/SMTP servers; no Sent copy for IMAP; no Drive attachments (drive.file can't see your Drive) |
| [~] | **AI drafts (Claude, Gemini), smart replies, thread summary** with local redaction (`thread.ts`), exact-payload confirmation, `[CHECK:]` blocking | `ai.test.ts` (10) with fake HTTP; real keys untested |
| [x] | **Snooze, follow-up reminders, email to event/task** (local) | `followups.test.ts`, `ai.test.ts` (dates) |
| [x] | **WebView2 check** no longer calls a working install damaged; the web view's own right-click menu is hidden in the Windows app | Rust standalone test |
| [x] | **Subscriptions page**: statement parser (CSV/OFX/QIF), recurring-charge detection, categories, totals, price changes, cancel guides, charged-after-cancel warning | `bankStatement.test.ts` (8), `subscriptions.test.ts` (11); screenshots; real bank exports untested beyond the formats handled |
| [x] | **Unsubscribe** (List-Unsubscribe https page, or a mailto draft you send) in the right-click menu and reader | `unsubscribe.test.ts` (3) |
| [x] | **Mail alert sound toggle (off by default)** and quick Not important / Mute sender / type on Home | `quick.test.ts` (2); the Windows toast sound itself is untested here |
| [x] | **Shopping History tab** | `shoppingHistory.test.ts` (4) |
| [x] | **Email layout**: tabs on top (default) or Classic, avatars, date groups, search | `mailUi.test.ts` (4); screenshots |
| [x] | **Mail sync completeness and progress**: Outlook delta paging no longer stops at 2,000 messages (it never got its bookmark, so big inboxes restarted every sync and could miss newer mail), Gmail first sync no longer stops at 300; the Email page shows a progress bar with counts (and a percentage where the total is known) while syncing, then the last result and time (green or red dot) | `graph.test.ts` (6, incl. 3,000-message inbox with progress), `gmail.test.ts`; screenshots at 1280 px and 412 px with mocked sync state. NOT verified against a real 2,000+ message Hotmail inbox. First sync after updating is slower (full 30 days) |
| [x] | **Assistant with Gemini** (function calling through the same tools) | `geminiSchema.test.ts` (3), `geminiAssistant.test.ts` (3) with a fake HTTP; real key untested |
| [x] | **Guardrails**: `.p12` deny rules, CLAUDE.md hard boundaries, `.claude/skills/release`, `.claude/rules/rust.md` | files on disk |
| [x] | **Home Tasks card is a 7-day view**: overdue group first, then Today, Tomorrow and each weekday to day 7 (empty days say "Nothing due"), undated tasks last; ticking a task completes it. Customise label is "Tasks, next 7 days" | `tsc`, build; Playwright mock screenshots at 1280 px and 412 px (light theme only; dark not checked) |
| [~] | **Home Headlines card** shows "Loading headlines…", the real error text and a Try again button, instead of always blaming browser CORS. NOT DONE: the underlying fetch failure on the user's device is undiagnosed (the sandbox has no internet, so real headlines were never seen) | Playwright screenshot of the error state only; needs a run in the Windows/Android app |
