# Real-time sync (beta)

Phone and PC edits merge field by field (a task completed on one device and rescheduled on the other keeps both).
Devices on the same Wi-Fi connect directly (WebRTC); away from home the relay carries the changes.

## Turn it on

1. Run the relay on an always-on PC or small server: `npm run sync-server` (HTTPS in front of it for use away from home).
2. Settings → Phone & sync → **Sync with Android and calling**: set the server address and a pairing code (8+ characters), same on every device.
3. Settings → Phone & sync → **Real-time sync (beta)** → switch on, on every device.

The panel shows *Direct · N device(s)*, *Relay only*, *Waiting for a device* or *Offline*.

## How it works

- Each device keeps a Yjs document next to its data (`calendar.db` on Windows/Android, saved with the rows). Edits become small updates sent to every connected device.
- Finding each other: `/signal` on the relay (messages encrypted with the pairing code). Direct link: WebRTC. Fallback and catch-up: `/crdt` on the relay, which keeps a copy of the merged document in `server/data/crdt/`.
- The relay sees your calendar data (as the older relay always did); the pairing code is never sent, only a hash of it.
- Not in the document: email, bank statements, API keys, sign-ins, per-device settings.

## While it is on

The older per-record relay sync and Google Drive sync are paused for events, tasks, notes, contacts and shopping (they would undo merged edits). Phone calls/texts, presence and invite replies still use the older channel. Turn it off to resume them.
If both devices already had the same records before you switch on, nothing is lost; if they had drifted apart, run **Sync now** on the older sync first.

## Diagnostics

Off by default. *Record sync diagnostics* keeps the last 500 events in memory only; *Export diagnostic package* writes one `.txt` with counts, status and that log. Keys, tokens, cookies, the pairing code and the server address are replaced with `[REDACTED]`; record text is never included.

## Limits (verified vs not)

Verified here: merge tests, SQLite tests, relay and signaling smoke test, two browsers linked directly with a concurrent edit merged.
Not verified: the Windows/Android Tauri builds with the SQL plugin (CI decides), phone-to-PC over a real router, WebRTC in the Android WebView, speed on Wi-Fi.
Downgrading to an older app version after migrating shows the old saved data (the old copy in the app's browser storage is kept, not updated).
