---
name: calendar-api
description: Google Calendar / Drive / People and Outlook (Microsoft Graph) integration for this app — OAuth (loopback + PKCE, popup), token storage, scopes, two-way calendar sync, RRULE mapping, Drive appdata backup, birthdays. Load when editing src/lib/google.ts, src/lib/email.ts, sync of events with an outside calendar, or OAuth/token code.
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
- `drive.appdata` — hidden per-app folder only
- `contacts.readonly` — birthdays for "Sync birthdays"
- `gmail.readonly` — email scan
Adding a scope: add to `SCOPES`, update `docs/GOOGLE_AND_OUTLOOK.md` (consent screen list), request it lazily at the
feature that needs it.

## 2. Two-way Calendar sync (`syncGoogleCalendar`)
Window: now −60 d … +365 d, `settings.google.calendarId`, watermark `settings.google.lastCalendarSync`.

Pull (per remote event, matched by `googleId`):
1. `status === "cancelled"` or no `start` → `fromGoogle` returns null (skip).
2. Not local → `store.upsert("events", …)` with `source: "google"`, `googleId`, `googleEtag`.
3. Local exists, not deleted, `googleEtag !== g.etag` and `g.updated > local.updatedAt` → remote wins (LWW).

Push (per local event):
1. `deleted` + `googleId` + `updatedAt > lastCalendarSync` → `DELETE`.
2. No `googleId` → `POST`, then store returned `id`/`etag` (never re-create: that duplicates).
3. `updatedAt > lastCalendarSync` and still remote → `PATCH`.
4. Finally `updateSettings(s => s.google.lastCalendarSync = Date.now())`.

Rules: never mutate store records (use `store.upsert`); birthdays (`bday:*`) are virtual and never pushed;
all-day = `start.date`/`end.date` (end exclusive), timed = `dateTime` + local `timeZone`.

### Recurrence mapping
- `recurrenceToRrule` → `RRULE:FREQ=…;INTERVAL=…[;BYDAY=…][;UNTIL=…|;COUNT=…]`; `rruleToRecurrence` parses back.
- **Known gap:** `exceptions` aren't sent as `EXDATE`, and cancelled instances from Google aren't mapped to
  `exceptions`. Fix: emit `EXDATE;VALUE=DATE:yyyyMMdd` (all-day) or `EXDATE:yyyyMMddTHHmmss` with TZID for timed;
  on pull, list instances with `showDeleted=true` and add cancelled `originalStartTime` dates to `exceptions`.
- Never store expanded occurrences; expand with `lib/recurrence.ts`.

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
- Pure mapping (`toGoogle`, `fromGoogle`, RRULE) → unit tests in `src/lib/google.test.ts`; mock `fetch`, never hit Google.
- Token logic: mock token endpoint responses (200, 400 `invalid_grant`).
- Manual: Settings → Connect Google → Sync now twice → no duplicates; edit/delete on each side propagates.
- Then `npx tsc --noEmit`, `npm test`, `npm run build`.
