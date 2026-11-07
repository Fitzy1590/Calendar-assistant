# Calendar Assistant

A weekly planner, calendar, task list, contacts and birthday tracker with weather, local events, news and
sports, plus a chat/voice assistant that can do anything in the app. One codebase runs as a **Windows app**
and an **Android app** ([Tauri 2](https://tauri.app)), and the two stay in sync in real time.

## Features

| Area | What you get |
|---|---|
| **Home** | Big weather panel (now, feels-like, hi/lo, rain, UV, sunrise/sunset, 24 h trend, 7-day strip), clock, mini calendar, today & tomorrow, tasks due, local events, birthdays, headlines, your teams. Every widget can be hidden or reordered. |
| **Day view** | Click any day (home strip, mini calendar, month cell, week header): that day's forecast + hourly, your events & tasks, and what's on in your suburb and city. |
| **Calendar** | Day / week / month / year (heat-map) views, keyboard shortcuts (←/→, T, D/W/M/Y), single or recurring events (daily, weekly on chosen days, monthly, yearly, every N, until/count, skip one occurrence), colours, reminders, conflict warnings. |
| **Tasks** | Synced with the calendar. Week board with drag-to-reschedule, list by day or priority, natural-language quick add, **Plan my week** (spreads undated/overdue tasks across your lightest days). |
| **Unfinished tasks** | Each morning, tasks you didn't tick off get a prompt: mark complete, move to today/tomorrow, pick a day, ignore for now, or remove. |
| **Reminders** | Events, birthdays (N days before) and tasks; each kind on/off; snooze, ignore once, or turn off per item; desktop/phone notifications. |
| **Contacts** | Birthdays, favourites, `.vcf` import, **Call** / **Text** from Windows through your Android phone. |
| **Assistant** | Command bar on every page (Ctrl+K) + mic. "Dentist Tuesday 3pm", "Soccer every Wednesday at 6pm", "Call Luke", "Text Mum saying running late", "What's on this week?", "Weather Saturday", "Plan my week", "Dark theme". Runs on-device, or switch to Claude for free-form requests. |
| **News** | Google News headlines by category and edition, followed topics, search. |
| **Sports** | Sports and favourite teams in the left menu; results, highlights links, upcoming fixtures, add fixtures to your calendar. |
| **Import** | Scan Gmail or Outlook, import Google Calendar, `.ics` files or pasted emails; multi-select what to add; conflicts with your calendar *and with each other* are flagged. |
| **Google** | Two-way Google Calendar sync; daily backup of data + settings to Google Drive. |
| **Backup** | Full JSON backup/restore (merges, never overwrites newer data), `.ics` and `.csv` export, 14 daily on-device snapshots, Drive backup. |
| **Settings** | Search box that filters every setting by keyword; everything you customise is remembered. |
| **Setup wizard** | Theme, location, formats, news, sports, reminders, phone sync, Google, assistant. Skip any step or the whole thing; skipped steps wait on the home page under "Finish setting up". Restore from a backup on the first screen. |
| **Feedback** | Suggestions button in the sidebar and top bar; saves notes and can open a prefilled GitHub issue. |

## How it fits together

```
 Windows app (Tauri)                        Android app (Tauri)
 ┌───────────────────────┐   WebSocket     ┌───────────────────────┐
 │ React UI + local store│◄──── sync ─────►│ React UI + local store│
 │ "Call Luke" ──────────┼──► command ────►│ opens dialer / SMS    │
 └──────────┬────────────┘   relay server  └──────────┬────────────┘
            │                 (server/)               │
            ├── Open-Meteo (weather), Google News RSS, TheSportsDB, Ticketmaster (optional)
            └── Google Calendar / Drive / Gmail, Microsoft Graph (your own OAuth IDs)
```

* **Local-first.** Data lives on each device (works offline). Changes are queued and sent when online.
* **Sync relay** (`server/sync-server.mjs`): a ~150-line Node server. Each pairing code is a private room;
  records merge last-writer-wins; deletes are tombstones. It also relays call/SMS commands and offers a
  small CORS proxy for the browser build.
* **Calls from Windows**: either through this app on your phone (route "companion", via sync) or through
  Microsoft **Phone Link** (`tel:` links), chosen in Settings.

## Run it

```bash
npm install
npm run dev            # browser preview at http://localhost:1420
npm test               # parser + recurrence tests
npm run sync-server    # sync relay on :8787 (put it behind HTTPS for real use)
```

### Windows app

Install [Rust](https://rustup.rs) and the WebView2 runtime (preinstalled on Windows 10/11), then:

```bash
npm run win:dev        # run the desktop app
npm run win:build      # .msi and .exe installers in src-tauri/target/release/bundle/
```

The **build** GitHub Action also produces the Windows installer on every push (Actions tab → artifacts).

### Android app

Install Android Studio (SDK + NDK) and set `ANDROID_HOME`/`NDK_HOME`, then:

```bash
npm run android:init   # one-time: generates src-tauri/gen/android
npm run android:dev    # run on a connected phone/emulator
npm run android:build  # APK/AAB
```

### Linking the phone

1. Run `npm run sync-server` somewhere both devices can reach (home PC, Raspberry Pi, VPS). For use
   outside your home network, put it behind HTTPS, e.g. a Cloudflare Tunnel or Caddy, and use `wss://`.
2. On Windows: Settings → Phone & sync → enter the server address, note the pairing code, turn sync on.
3. On Android: same server and the **same pairing code**, sync on. The sidebar shows "Synced · 1 device".

## Optional keys

| Key | For | Where |
|---|---|---|
| Google OAuth client ID | Google Calendar sync, Drive backup, Gmail scan | see [docs/GOOGLE_AND_OUTLOOK.md](docs/GOOGLE_AND_OUTLOOK.md) |
| Microsoft client ID | Outlook mail + calendar scan | same doc |
| Anthropic API key | Claude assistant mode | Settings → Assistant (stays on the device, excluded from backups) |
| Ticketmaster key | Local event listings per day | Settings → Weather & location |
| TheSportsDB key | Higher sports API limits | Settings → Sports (free public key used by default) |

## Current limits / next steps

* **Voice input** uses the Web Speech API. Where the webview lacks it, the mic button says to use
  Windows dictation (Win+H) or the Android keyboard mic. A native speech plugin is the next step.
* **Calling from Android** opens the dialer with the number filled in (one tap to call). Auto-dialling
  needs the `CALL_PHONE` permission and a small native plugin.
* **Google/Microsoft sign-in in packaged builds** needs a loopback OAuth flow; see the doc above.
* **News in a plain browser** needs the sync server's proxy (Google News blocks cross-site requests);
  the Windows/Android apps fetch it natively.

## Project layout

```
src/
  lib/        nlp (dates & recurrence phrases), recurrence, assistant, actions, sync, phone,
              weather, news, sports, localEvents, email, google, backup, reminders, planner
  pages/      Home, Calendar, Tasks, Contacts, Reminders, News, Sports, Settings, Wizard
  components/ Sidebar, Assistant, DayPanel, EventEditor, EmailImport, CarryOver, Feedback, SetupParts, ui
server/       sync relay
src-tauri/    Windows/Android shell (Rust), permissions, icons
docs/         setup guides
```
