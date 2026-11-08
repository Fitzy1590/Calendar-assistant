# Connecting Google (Calendar, Drive, Gmail) and Outlook

Everything runs on your device with your own OAuth app IDs. No third-party server sees your mail or calendar.

## Google

There are two kinds of Google OAuth client. Create the one for where you run the app (or both):

| Running | Client type | What you paste in Settings |
|---|---|---|
| Installed Windows app | **Desktop app** | Client ID **and** client secret |
| Browser / `npm run dev` | **Web application** | Client ID |

The installed app signs in the way Google recommends for desktop apps: it opens your normal browser,
Google sends you back to a one-time `http://127.0.0.1:<port>` address the app listens on, and the app
swaps the code for tokens (PKCE). You stay signed in, so Calendar sync and Drive backup run in the
background. The refresh token lives only on that PC (not in sync or backups); **Disconnect** revokes it.
Google treats desktop client secrets as non-confidential, but the app still leaves them out of backups.

Android doesn't sign in to Google itself: the Windows app does the Google work and everything it adds
reaches the phone through sync.

### Setup (one client ID covers Calendar sync, Drive backup and Gmail scanning)

1. Go to <https://console.cloud.google.com/>, create a project (e.g. "Calendar Assistant").
2. **APIs & Services → Library**: enable **Google Calendar API**, **Google Drive API**, **Gmail API** and
   **People API** (birthdays from Google Contacts).
3. **OAuth consent screen**: External, add yourself as a test user. Scopes used:
   - `calendar.events` (read/write events: two-way sync)
   - `drive.appdata` (a hidden app-only folder for backups; the app cannot see your other Drive files)
   - `gmail.readonly` (scan for bookings/invites)
   - `contacts.readonly` (names, numbers and birthdays for **Sync birthdays**)
4. **Credentials → Create credentials → OAuth client ID**:
   - **Desktop app** (installed Windows app): nothing else to fill in; loopback addresses are allowed
     automatically. Copy the client ID and client secret.
   - **Web application** (browser/dev): JavaScript origin `http://localhost:1420`, redirect URI
     `http://localhost:1420/oauth.html`. Copy the client ID.
5. Paste them into **Settings → Email, Google & Outlook** (or the wizard's Google step), then press
   **Connect Google account**.

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
| Sync birthdays | Calendar page | Reads Google Contacts; fills in missing birthdays, numbers and emails, adds people who have a birthday |
| Scan Gmail / Outlook | Import dialog | Finds bookings, invites and confirmations; multi-select; conflicts flagged; `.ics` attachments parsed exactly |

## Outlook in the installed app

The Outlook scan still uses the browser-style popup sign-in, so it works from `npm run dev` / the browser
build. Moving it to the same loopback flow (Azure "Mobile and desktop applications" platform with
`http://localhost`) is the next step if you use Outlook from the installed app.
