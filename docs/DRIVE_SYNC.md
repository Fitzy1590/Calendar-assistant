# Sync through Google Drive (no server)

An alternative to the sync server: your devices share your data through a hidden folder in **your own Google Drive** that only
Calendar Assistant can see. Works on the same Google account on every device. Both can run at once.

## Easiest way: the in-app guide

In the app, press **Step-by-step setup guide** (Settings → Phone & sync, Settings → Email, Google & Outlook, or the setup wizard).
It gives plain instructions with buttons that open the exact Google pages, for your PC or your phone. The notes below are the
same steps in short form.

One step is easy to miss: in your Google Cloud project, **turn on the Google Drive API** (and the Google Calendar API if you want
Google Calendar sync), or sign-in works but Drive calls fail.

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
- Android signs in with a device code (see below); it syncs while the app is open, not while closed.

## Android

Android can't use the Windows sign-in, so the phone signs in with a **device code**: it shows a short code, you type it at
google.com/device on any device, and the phone receives the sign-in. Drive sync only needs the Drive app-folder permission, which
Google allows in this flow (if Google ever refuses, the sign-in dialog shows its message).

1. In Google Cloud (the **same project** as your Windows client; the hidden folder is shared per project): APIs & Services →
   Credentials → Create credentials → OAuth client ID → type **TVs and Limited Input devices**. Copy the client ID and secret.
2. If the OAuth consent screen is in **Testing**, add your Google account as a test user. In Testing, Google ends the sign-in after
   about 7 days; set the app to **In production** (an "unverified app" warning is fine for personal use) to keep it.
3. On the phone: Settings → Phone & sync → **Sync through Google Drive**. Enter the client ID and secret, press **Get a sign-in
   code**, enter the code at google.com/device, pick your account and allow it. The dialog closes and Drive sync turns on.
4. The phone then syncs when the app opens or returns to the front, every few minutes while it is running, and soon after you change
   something. The client secret stays on the phone only (not in backups).

- Needs an Android build that includes this feature (it is not in the APK from before v0.1.7).
- Sync while the app is **closed** needs native Android code (WorkManager, 15-minute minimum). That is not built yet.
- Calendar and Gmail never sign in on the phone: Windows syncs them and they reach the phone through the Drive files.
