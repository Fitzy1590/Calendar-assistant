# Connecting Google (Calendar, Drive, Gmail) and Outlook

Everything runs on your device with your own OAuth app IDs. No third-party server sees your mail or calendar.

## Google: one client ID covers Calendar sync, Drive backup and Gmail scanning

1. Go to <https://console.cloud.google.com/>, create a project (e.g. "Calendar Assistant").
2. **APIs & Services → Library**: enable **Google Calendar API**, **Google Drive API** and **Gmail API**.
3. **OAuth consent screen**: External, add yourself as a test user. Scopes used:
   - `calendar.events` (read/write events: two-way sync)
   - `drive.appdata` (a hidden app-only folder for backups; the app cannot see your other Drive files)
   - `gmail.readonly` (scan for bookings/invites)
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorised JavaScript origin: the app's origin, e.g. `http://localhost:1420`
   - Authorised redirect URI: `http://localhost:1420/oauth.html`
5. Paste the client ID into **Settings → Email, Google & Outlook** (or the wizard's Google step).

## Outlook / Microsoft 365

1. <https://entra.microsoft.com/> → **App registrations → New registration**.
2. Supported accounts: "Accounts in any organizational directory and personal Microsoft accounts".
3. Redirect URI: platform **Single-page application**, `http://localhost:1420/oauth.html`.
4. **API permissions** → Microsoft Graph → Delegated: `Mail.Read`, `Calendars.Read`, `offline_access`.
5. Paste the **Application (client) ID** into Settings.

## What each button does

| Feature | Where | Behaviour |
|---|---|---|
| Import Google Calendar | Import dialog | Lists the next 180 days; tick what to add; conflicts flagged |
| Two-way Google Calendar sync | Settings | Pulls -60/+365 days, pushes new/edited/deleted local events, every 15 min while signed in |
| Google Drive backup | Settings / wizard | Daily JSON backup to the hidden app folder; restore from the wizard's first screen on a new device |
| Scan Gmail / Outlook | Import dialog | Finds bookings, invites and confirmations; multi-select; conflicts flagged; `.ics` attachments parsed exactly |

## Known limitation in the packaged desktop/Android app

Google only accepts `localhost` or public HTTPS redirect URIs, and the packaged Tauri app is served from
`tauri.localhost`. Sign-in therefore works today when running from `npm run dev` / `npm run win:dev`
(origin `http://localhost:1420`). Before shipping installers, swap the popup flow in `src/lib/google.ts`
for a loopback flow (e.g. `tauri-plugin-oauth`, which opens the system browser and listens on
`127.0.0.1:<port>`). Microsoft accepts custom-scheme redirects, so a `calendarassistant://` deep link
also works there.
