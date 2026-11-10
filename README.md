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
| **Notes** | Sticky-note board: colours, pin, drag to reorder, `[ ]` checklists, `#tags`, search, dictation, archive, undo delete, turn a note into a task or event. "Take a note: gate code is 4821". |
| **"Hey Planner"** | Wake word while the app is open (and in the Windows tray when the window is closed): chime, then speak a command, a question or a note. On-device with Picovoice; nothing leaves the device while it waits. |
| **Invites** | Add people to any event (contacts, emails or numbers) and send by text or email from your own phone/mail app. Each guest gets your standard message (or one written for that event) with the time, place, a Google Maps link and a personal **Accept / Maybe / Can't make it** link with room for a note and "add to my calendar (with reminder)". Replies appear on the event on both devices with an alert. "Invite Luke and Sam to dinner Friday 7pm at Mama's Kitchen". |
| **Birthdays on the calendar** | Every contact's birthday shows as a yearly all-day event, generated from Contacts, so every future year is always there (plan December in January). **Sync birthdays** shows who's missing a date and pulls dates from Google Contacts or a phone export. |
| **Shopping** | "I need to buy paint": nearby stores that sell it (OpenStreetMap, sorted by distance, hours, call), live online prices cheapest-first with the source page (via Claude web search), one-tap searches on Amazon AU, Officeworks, Bunnings and more. Every result offers **Go now** (Google Maps navigation), **Calendar**, **Task**, **Shopping list**, **Open item**. A shopping list grouped by store, and **price tracking** with daily checks, trend, lowest price, target-price alerts. |
| **Contacts** | Birthdays, favourites, `.vcf` import, **Call** / **Text** from Windows through your Android phone. |
| **Assistant** | Command bar on every page (Ctrl+K) + mic. "Dentist Tuesday 3pm", "Soccer every Wednesday at 6pm", "Call Luke", "Text Mum saying running late", "What's on this week?", "Weather Saturday", "Plan my week", "Dark theme". Runs on-device, or switch to Claude for free-form requests. |
| **News** | Google News headlines by category and edition, followed topics, search. |
| **Sports** | Sports and favourite teams in the left menu; results, highlights links, upcoming fixtures, add fixtures to your calendar. |
| **Import** | Scan Gmail or Outlook, import Google Calendar, `.ics` files or pasted emails; multi-select what to add; conflicts with your calendar *and with each other* are flagged. |
| **Google** | One-click two-way Google Calendar sync (Settings → Sync with Google Calendar), automatic every 5–60 minutes and when the app opens; daily backup of data + settings to Google Drive. |
| **Backup** | Full JSON backup/restore (merges, never overwrites newer data), `.ics` and `.csv` export, 14 daily on-device snapshots, Drive backup. |
| **Settings** | Search box that filters every setting by keyword; everything you customise is remembered. |
| **Email** | Outlook/Hotmail inbox (read-only): junk and subscriptions filtered out, important mail on Home with desktop alerts, a menu badge and a morning summary. Your own rules (always notify, treat as important, mute, send to Bills). A Bills tab with amounts, due dates, Mark as paid, Calendar/task buttons and reminders. Setup: [docs/EMAIL_SETUP.md](docs/EMAIL_SETUP.md). Windows app. |
| **Drive sync** | Sync devices through a hidden Google Drive folder, no server (Settings → Phone & sync). One file per device, newest edit wins, last-synced indicator, a warning when the calendar may be out of date, and a consistency check. Windows now; Android next. See [docs/DRIVE_SYNC.md](docs/DRIVE_SYNC.md). |
| **Looks** | Seven themes (Paper, Sand, Ink, Slate, OLED dark, Forest, High contrast, or match the system), any accent colour, three densities (Compact, Comfortable, Spacious) and text size. Text stays readable on every theme. |
| **Setup wizard** | Theme, location, formats, news, sports, reminders, phone sync, Google, assistant. Skip any step or the whole thing; skipped steps wait on the home page under "Finish setting up". Restore from a backup on the first screen. |
| **Updates** | Checks for a new version on launch: Windows installs it and restarts (automatically if you like); Android downloads the new APK and asks to install. **Settings → Updates → Check for updates now** forces a check. |
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
* **Sync relay** (`server/sync-server.mjs`): a small Node server. Each pairing code is a private room;
  records merge last-writer-wins; deletes are tombstones. It also relays call/SMS commands, hosts the
  RSVP pages guests open from invites, and offers a small CORS proxy for the browser build.

### How sync behaves

* **Automatic and live.** Every change (events, tasks, notes, contacts, shopping, invite replies) is sent
  the moment you make it. While both apps are open the other device shows it within about a second.
* **Offline-safe.** Changes made offline are queued on the device and sent when the connection returns.
  Each app reconnects on its own, and catches up as soon as it comes back on screen (phone unlocked,
  laptop woken, network back). A heartbeat every 25 s notices a dead connection.
* **Conflicts.** If the same item is edited on both devices before they sync, the most recent edit wins
  for that item. Different items never overwrite each other.
* **Sync now.** Click the sync status in the sidebar for devices online, last sync and waiting changes.
  **Sync now** does a full two-way catch-up: it pulls everything from the server and re-sends
  everything on the device.
* **Preferences.** News, sports, reminders, invite and shopping preferences can be shared across devices
  (on by default). Theme, layout, keys and the device name stay per device.
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

## If something goes wrong

* **What Windows needs:** Windows 10 or 11 and Microsoft Edge WebView2 Runtime. The installer checks for
  WebView2 and installs it when missing (needs internet once). The app no longer needs the Visual C++
  Redistributable; the C runtime is built in.
* **If the app can't start or closes on its own**, it shows a plain-English message instead of
  vanishing, with buttons to get the fix (for example the WebView2 download), report the problem
  (GitHub with the details filled in), or close. A crash report is saved in
  `%LOCALAPPDATA%\com.fitzy.calendarassistant\crash-reports`.
* **WebView2 removed or blocked by a "debloat" tool:** the app checks why it can't open its window (WebView2
  not installed, blocked from starting, or blocked from being installed by a policy) and offers:
  * **Fix it automatically**: one Windows admin prompt; undoes only the WebView2 blocks (a debloat tool's
    other choices, like blocking the Edge browser, stay), reinstalls WebView2 from Microsoft and restarts.
    A log is saved as `webview2-repair.log` in the crash-reports folder.
  * **Open in your web browser instead**: the app serves itself to your normal browser on this PC only
    (`http://127.0.0.1:47821`) and closes a few minutes after the tab does. Calendar, tasks, notes,
    reminders and sync all work; tray icon, Windows Google sign-in and in-app updates don't. It can
    remember this choice (delete `%LOCALAPPDATA%\com.fitzy.calendarassistant\prefer-browser-mode` to undo).
    You can also start it this way with `"Calendar Assistant.exe" --browser-mode`.
* **Automatic fixes:** problems are fixed by themselves where that's safe. A page that won't draw has its
  layout reset and is retried; damaged saved data is restored from the newest daily backup; a full storage
  is cleared of caches and old history; a half-loaded update reloads; lost connections catch up when you're
  back online. Nothing that deletes your data or changes Windows settings happens without asking.
* **Problems while using it** show a short explanation with a fix where there is one; a page that
  breaks shows a recovery screen (Try again / Restart / Back up my data / Report) while the rest of the
  app keeps working.
* **Settings → Help & diagnostics** runs a system check (WebView2, internet, storage, notifications,
  microphone, location, sync server) with fix links, and lists recent problems with one-click reports.
  The check also runs quietly on first launch and only speaks up if something needs attention.

## Current limits / next steps

* **Voice** in the installed apps uses Picovoice (on-device): a free AccessKey from
  console.picovoice.ai, plus a "Hey Planner" model trained there (Porcupine → Web/WASM) added in
  Settings. Until you add it, the built-in word "Computer" is used. Models download once (~40 MB) and
  are cached. In a Chrome/Edge browser window, the browser's speech service also works.
* **Android** pauses the microphone for apps in the background, so "Hey Planner" works while the app is
  on screen. On Windows, closing the window keeps it running in the tray (can be turned off).
* **Android microphone permission**: after `npm run android:init`, add
  `<uses-permission android:name="android.permission.RECORD_AUDIO" />` to
  `src-tauri/gen/android/app/src/main/AndroidManifest.xml`.
* **Calling from Android** opens the dialer with the number filled in (one tap to call). Auto-dialling
  needs the `CALL_PHONE` permission and a small native plugin.
* **Invite Accept links** need the sync server reachable from the internet (HTTPS). On a home-only
  address the app warns you and invites simply ask people to reply.
* **Prices.** No free API covers Australian retailers, so live prices use Claude's web search (your
  Anthropic key) and are only as fresh as the shop's page. Price tracking reads the price shops publish
  in their page data; a few big sites (e.g. Amazon) block automated reads, so track another retailer's
  link for those items.
* **Location on Android**: after `npm run android:init`, add
  `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />` to the manifest for
  "near me" searches (otherwise your home suburb is used).
* **Google sign-in** works in the installed Windows app (browser + loopback, stays signed in). Outlook
  scanning from the installed app still needs the same change; see the doc.
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
