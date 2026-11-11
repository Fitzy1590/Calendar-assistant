---
name: calendar-api
description: Google Calendar / Drive / People and Outlook (Microsoft Graph) integration for this app — OAuth (loopback + PKCE, popup), token storage, scopes, two-way calendar sync, RRULE mapping, Drive drive.file backup/sync, birthdays. Load when editing src/lib/google.ts, src/lib/email.ts, sync of events with an outside calendar, or OAuth/token code.
---

# Calendar API procedures

Code: `src/lib/google.ts` (Google), `src/lib/email.ts` (Gmail/Outlook scan). User setup: `docs/GOOGLE_AND_OUTLOOK.md`.
All requests go through `gfetch(url, scope, init)` (Google) — it gets a token for exactly that scope.

## 1. Google OAuth

| Build | Flow | Where |
|---|---|---|
| Windows / Android (Tauri) | Auth code + PKCE (S256) over loopback: `tauri-plugin-oauth` listens on `127.0.0.1:<port>`, system browser opens Google | `loopbackSignIn` |
| Browser / dev | Implicit token in a popup, redirect `/oauth.html` | `popupSignIn` |

- Desktop client ID + secret come from settings (`settings.google`), entered by the user. Google treats a desktop
  secret as non-confidential, but it still never goes in the repo, logs, or backups (`backup.ts makeBackup` blanks it).
- Request with `access_type=offline&prompt=consent&include_granted_scopes=true`. `googleToken(scopes)` asks for the
  **union** of previously granted + new scopes so one sign-in covers everything.
- `state` must be checked on the redirect; `error=access_denied` → "Google sign-in was cancelled."
- Refresh token: `localStorage["google-refresh"]` = `{ refresh, scopes }`, device-only (not synced, not backed up).
  Access token lives in memory only. Refresh 60 s before expiry.
- Backlog (FEATURE_PROGRESS.md): move refresh token to OS secure storage; on `invalid_grant` clear it and show
  "Reconnect Google"; redact `ya29.` / `Bearer` from error reports.
- `quietly(fn)` runs background calls non-interactively: no sign-in window, fail silently if not connected.

### Scopes (`SCOPES`) — request the narrowest
- `calendar.events` — read/write events (not calendar list/ACLs)
- `drive.file` — only files this app created (we avoid `drive.appdata`: Google's device flow rejects it)
- `contacts.readonly` — birthdays for "Sync birthdays"
- `gmail.readonly` — email scan
Adding a scope: add to `SCOPES`, update `docs/GOOGLE_AND_OUTLOOK.md` (consent screen list), request it lazily at the
feature that needs it.

## 2. Two-way Calendar sync
Files: `googleSync.ts` (engine, takes an injected `GoogleApi` so tests use a fake), `googleMap.ts` (pure event/RRULE/EXDATE
mapping), `googleAuto.ts` (schedule), `google.ts` (`syncGoogleCalendar`, `googleCalendarOneClick`). One run at a time (`inflight`).
Settings: `settings.google` — `calendarSync`, `syncEveryMins` (default 15), `syncToken`, `lastCalendarSync` (push watermark),
`lastCalendarSyncAt`, `lastCalendarSyncError`.

Pull = only what changed (`syncToken`; first run / expired token (410) = everything from 60 days ago, `showDeleted=true`):
1. Whole events and series first, then single occurrences (they need their series).
2. `status: cancelled` + local match by `googleId` → `store.remove` (tombstone). No match → ignore.
3. New → `store.upsert`; changed (`etag` differs and Google `updated` newer than local) → merge. Exceptions are a union of local and EXDATE.
4. Instance (`recurringEventId` + `originalStartTime`): add its original date to the series' `exceptions`; cancelled → done; moved/edited → its own event.
5. Two local copies of one `googleId`: unlink one (clear `googleId`) *then* remove it, so it never deletes the Google event.

Push (events changed by this pull are skipped, so nothing is echoed back):
- deleted + `googleId` + edited after `lastCalendarSync` → `DELETE` (404/410 = already gone).
- no `googleId` → `POST`, store `googleId`/`etag` (never re-create: that duplicates). Events that ended >60 days ago are not sent.
- edited after `lastCalendarSync` → `PATCH`; `recurrence` is `null` (not omitted) so a series can be cleared.
- 404/410 on PATCH = not in this calendar (other account): **unlink**, don't delete; it is created again next run.
- 401/403 or "sign in" → stop and show the error. Any other per-event failure is counted, the rest continue, and
  `lastCalendarSync` is not advanced so failures are retried.
- Disconnecting clears `syncToken` (it belongs to the account).

Automatic: `startGoogleAutoSync()` (from `App.tsx`) checks every minute; syncs on open/focus if the last run is >1 min old,
else every `syncEveryMins`. Silent (`quietly`); only where Google sign-in exists (not Android: the phone gets changes through app sync).
Not yet synced: attendees/guests (backlog), Google Meet links, per-event colours.

Rules: never mutate store records (use `store.upsert`); birthdays (`bday:*`) are virtual and never pushed;
all-day = `start.date`/`end.date` (end exclusive), timed = `dateTime` + local `timeZone`.

### Recurrence mapping
`toRecurrenceLines` → `RRULE:FREQ=…;INTERVAL=…[;BYDAY=…][;UNTIL=…|;COUNT=…]` plus one `EXDATE` line
(`;VALUE=DATE:` for all-day, `;TZID=<tz>:…T<start time>` for timed); `parseRecurrence` reads RRULE and EXDATE (date, TZID, UTC forms).
Never store expanded occurrences; expand with `lib/recurrence.ts`.

## 3. Drive backup (appDataFolder)
`files?spaces=appDataFolder&q=name='<NAME>'` to find; `upload/drive/v3/files?uploadType=multipart` to create/update.
Content = `makeBackup()` output (secrets already blanked).

## 4. Birthdays (People API)
`people/me/connections?personFields=names,birthdays,phoneNumbers,emailAddresses`. Upsert into `contacts`
(match by name, then phone, then email; only fill empty fields); birthdays then appear via `calendarEvents()` — never write `bday:` events.

## 5. Outlook (Microsoft Graph)
- Popup OAuth against `login.microsoftonline.com/common/oauth2/v2.0/authorize`, user's own app client ID,
  scopes `openid offline_access Mail.Read Calendars.Read` (read-only).
- `me/calendarView?startDateTime&endDateTime` with `Prefer: outlook.timezone="<IANA>"`; `me/messages?$search`.
- Results become import `Candidate`s (user picks, conflicts flagged) — not a live two-way sync.
- Backlog: loopback flow for the installed app.

## 6. Testing / verification
- Pure mapping → `src/lib/googleMap.test.ts`. Sync engine → `src/lib/googleSync.test.ts` (fake in-memory Google passed as `GoogleApi`); never hit Google.
- Token logic: mock token endpoint responses (200, 400 `invalid_grant`).
- Manual: Settings → Sync with Google Calendar twice (second run "0 in, 0 out") → no duplicates; edit/delete on each side propagates.
- Then `npx tsc --noEmit`, `npm test`, `npm run build`.
