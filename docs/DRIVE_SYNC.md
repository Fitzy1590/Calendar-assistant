# Sync through Google Drive (no server)

An alternative to the sync server: your devices share your data through a hidden folder in **your own Google Drive** that only
Calendar Assistant can see. Works on the same Google account on every device. Both can run at once.

## Turn it on (Windows)

1. Settings → **Email, Google & Outlook**: add your Google client ID (same one used for Calendar and Drive backup).
2. Settings → **Phone & sync → Sync through Google Drive** → **Connect Google and turn on Drive sync**.
3. Choose how often to sync (1, 5, 15 or 30 minutes). It also syncs when the app opens or returns to the front, and about
   20 seconds after you change something. **Sync now** forces a round.

## How it works

- Every device writes **one file of its own** (`ca-sync-<device>.json`) with all its records: events, tasks, notes, contacts,
  shopping and shared preferences. It only ever **reads** the other devices' files. Drive can't safely handle two devices editing
  one file at once, so one file per device means nothing can conflict.
- A device downloads another's file only when Drive says it changed, and uploads its own only when its data changed.
- Records merge **newest edit wins**, one record at a time. Deleting something leaves a marker so it stays deleted on the other
  device. Markers are dropped after 180 days.
- Never in the file: API keys, sign-ins, backups of settings. A file from another app, or with unknown or malformed content, is
  ignored.
- Google Calendar: Windows syncs with Google Calendar (Settings → Sync with Google Calendar) and those events join the next Drive
  round, so a phone gets them without signing in to Calendar.

## Is my calendar up to date?

- **Last synced** shows in Settings, and a bar appears at the top of the app, with a **Sync now** button, when the last good sync is
  older than the limit you set (default 30 minutes) or when sync is failing.
- After each round a **consistency check** confirms every record a peer holds is now here at least as new; any that didn't land are
  applied again (the count is shown).
- Each other device is listed as **matches this device** or **will catch up on its next sync**.

## Limits

- Not instant: changes show up after the sync interval (or at once if both apps are open and you press Sync now). The sync server
  is faster.
- Your data must stay under about 25 MB.
- **Android is not connected yet.** It needs its own sign-in (see below).

## Android (next step)

Android can't use the Windows sign-in. Plan: **device-code sign-in**: the phone shows a short code, you enter it at
google.com/device. Google allows only the Drive app-folder permission for that flow, which is all this needs.

- Create a second OAuth client of type **TVs and Limited Input devices** in the **same Google Cloud project** as the Windows client
  (the hidden folder is shared per project).
- Android syncs when the app opens, returns to the front, and on a timer while running. Sync while the app is closed needs native
  Android code (WorkManager, 15-minute minimum) and is a separate, later step.
