# Android app and Galaxy Z Fold 6

Layout follows the window width, so folding or unfolding is just a resize (the Android activity is set to survive it).

| Width | Where | Layout |
|---|---|---|
| under 600 px | folded cover screen, ordinary phones | scrolling bottom bar (all pages), Calendar month = compact grid with dots + that day's agenda |
| 600 to 1100 px | unfolded inner screen | left rail with every page; editors (event, task, contact, note) and the day panel dock beside the page; Mail list beside the reader |
| over 1100 px | Windows | top bar, as before |

Android-only behaviour: Back closes what is open (dialog, assistant, day panel, mail reader), then goes Home, then leaves the app.
Reminders for the next 7 days are scheduled with Android so they fire with the app closed (re-planned after any change and every 6 hours).
`scripts/android-permissions.mjs` adds the notification, exact-alarm, microphone and location permissions and the fold-safe activity settings after `tauri android init`.

## Real-phone checklist (not verified yet)

1. Install the APK from the `android-apk` build artifact. Open it folded, then unfold while on Calendar: it must not restart, and the layout must switch to the rail.
2. Cover screen: no sideways scrolling on any page; bottom bar scrolls; month grid taps select a day.
3. Unfolded: open a contact, a note, an event: the editor sits on the right and the list stays usable.
4. Back button from an open editor, from Tasks, from Home.
5. Add an event with a reminder 3 minutes ahead, close the app: the notification arrives. If not, Settings > Apps > Calendar Assistant > Alarms & reminders.
6. Keyboard: typing in a note or task keeps the field visible.
7. Real-time sync with the PC (docs/P2P_SYNC.md) and SQLite data surviving an app restart.

Not available on Android: other-mailbox (IMAP/SMTP) accounts (the Rust crates are desktop only), tray, taskbar full screen, in-app updater (use the new APK).
