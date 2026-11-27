import { create } from "zustand";
import { newer } from "./updates";

/**
 * "What's new" shown once after an update. Bundled with the app (no network), newest first.
 * Add an entry here for every release; plain words, at most 3 points.
 */
export interface WhatsNewEntry {
  version: string;
  title: string;
  points: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: "0.3.11",
    title: "Finance: cash flow, subscriptions and budgets",
    points: [
      "A new Finance page (turn it on first): see your balance day by day, with warnings before a bill takes you low or overdrawn, and Low cash / Overdrawn marks in the calendar month view.",
      "Track subscriptions and price rises, get a reminder 3 days before a trial ends or a yearly plan renews, and plan with 50/30/20 or zero-based budgets and savings goals.",
      "Everything is kept in an encrypted file on this PC, with its key in Windows Credential Manager. It is never synced, backed up or sent anywhere. Windows only.",
    ],
  },
  {
    version: "0.3.10",
    title: "One font everywhere, with choices",
    points: [
      "Every page now uses one font family, including dates and times in the calendar, which were in a blocky monospace.",
      "Pick a font in Settings, Theme (button in the top bar): IBM Plex Sans, Inter, Outfit, Atkinson Hyperlegible, the Windows system font, or Match theme to bring back each theme's own fonts.",
      "Codes, keys and web addresses stay in monospace so they are easy to read out. Windows only.",
    ],
  },
  {
    version: "0.3.9",
    title: "11 new themes and a Theme button",
    points: [
      "New themes: Tokyo Night, Solarized Dark, Retro Synthwave, Editorial, Neumorphic, Rose Gold, Pastel Dreams, Crimson Eclipse, Deep Space, Sunset Horizon and Arcade 16-bit.",
      "The new Theme button in the top bar opens every theme; one tap switches, with no animation delay.",
      "High contrast now has thicker borders. Windows only.",
    ],
  },
  {
    version: "0.3.8",
    title: "Glass theme and a quicker top bar",
    points: [
      "A new dark Glass theme (Settings, Theme): frosted cards, a glow on today, and no animation delay when you switch pages.",
      "The top bar shows the date and sync status, and the + button starts a new event in one tap.",
      "The month view now works with the keyboard: arrow keys move between days, Page Up and Page Down change month. Windows only.",
    ],
  },
  {
    version: "0.3.7",
    title: "Easier reading in Email",
    points: [
      "The email page now scrolls as one page, and the action bar no longer follows you down a message.",
      "New Unread only button: opening a message marks it seen and clears it from that list. Windows only.",
    ],
  },
  {
    version: "0.3.6",
    title: "Four new colour themes",
    points: [
      "Sky, Lavender and Lagoon (light) and Ocean (dark) join the theme picker in Settings.",
      "Every theme now brings its own matching accent colour. Pick a colour yourself, or the first dot, Match theme, to go back to the theme's own. Windows only.",
    ],
  },
  {
    version: "0.3.5",
    title: "Humidity for every day",
    points: [
      "Each day's average humidity now shows beside the temperature in the Calendar (month, week and day), on the Home forecast, in the day panel and when you ask the assistant about the weather.",
      "On a phone the humidity sits under the temperature so it fits. Windows only.",
    ],
  },
  {
    version: "0.3.4",
    title: 'Fix for the email "Something went wrong" message',
    points: [
      'Some HTML emails (the ones styled to fill the whole screen) made the message area grow and showed "ResizeObserver loop completed". They now open at their natural size.',
      "Windows only.",
    ],
  },
  {
    version: "0.3.3",
    title: "Emails with links, and more colour",
    points: [
      "Gmail and Outlook emails now open as real HTML with clickable links, tables and buttons. Switch to Rich or Plain above any message. Other mailboxes still show plain text.",
      "Pictures in emails follow your choice in Settings: always show, only for senders you trust, or blocked until you allow. Scripts never run.",
      "A calmer use of colour: each folder tab, row label and message heading is coloured by type (important, action, financial and so on), in every theme. Windows only.",
    ],
  },
  {
    version: "0.3.2",
    title: "Email now pulls in everything",
    points: [
      "Big Outlook and Gmail inboxes now sync the whole last 30 days. Before, Outlook stopped at 2,000 messages and Gmail at 300, so mail could be missing.",
      "The sync button now shows progress while it works, then how many messages were checked and when it last finished.",
      "The first sync after updating takes longer because it fetches the full 30 days.",
    ],
  },
  {
    version: "0.3.1",
    title: "Your week of tasks on Home",
    points: [
      "The Tasks card on Home now shows the next 7 days, one group per day, with overdue tasks first and undated tasks last.",
      "If the Headlines card can't load, it now says why and has a Try again button.",
    ],
  },
  {
    version: "0.3.0",
    title: "A cleaner look",
    points: [
      "The menu is now a bar across the top on Windows (the bottom bar stays on phones), cards are rounder, and there are four new themes: Midnight, Ember, Graphite and Nord.",
      "Tasks, Notes, Shopping, Email, Home, News, Sports, Subscriptions and Settings were tidied. Adding is now a round + button, and row buttons show when you point at a row or swipe it on a phone.",
      "On Home, press Customise, then Rearrange cards, and drag cards where you want them.",
    ],
  },
  {
    version: "0.2.8",
    title: "Sports games fill your calendar",
    points: [
      "Upcoming games of the teams you follow are now added to your main calendar automatically when the app opens and after each sync. Games you delete stay deleted.",
      'Don\'t want them? Turn off "Add games to my main calendar" at the top of the Sports page.',
    ],
  },
  {
    version: "0.2.7",
    title: "Drag tasks between days",
    points: [
      "Tasks: dragging a task to another day, or to Unscheduled, now works on Windows and Android. On a phone, drag by the dotted handle. With the keyboard, press Alt + Left or Right on a task.",
      "Task cards in the week plan wrap their text at spaces, and the delete button shows when you point at a card.",
    ],
  },
  {
    version: "0.2.6",
    title: "Easier email, task planning and menu",
    points: [
      "Email: Reply, Forward, Unsubscribe and Snooze are now at the top of the message, above the subject. The sender, date and text are laid out more clearly, and long tracking links are hidden from newsletters.",
      "Tasks: double-click a day (or press Add task) to add a task to it, and drag tasks between days. Today is now clearly highlighted in Tasks and the Calendar.",
      "The left menu can be minimised to an icon strip with the arrow at its top; it remembers your choice.",
    ],
  },
  {
    version: "0.2.5",
    title: "Starts properly on locked-down PCs",
    points: [
      "If Windows blocks the app's window (a clean-up tool or a policy blocking WebView2), the app now explains why and offers to open in your web browser, instead of opening File Explorer.",
      "Weather, Sports and other online pages now load on PCs where the app's built-in web client was being refused. Errors name the service that failed.",
    ],
  },
  {
    version: "0.2.4",
    title: "Hotmail on Android and backups to a file",
    points: [
      "Outlook / Hotmail email now works on Android: Settings → Email shows a short code to enter at microsoft.com/devicelogin, and mail syncs and alerts like on Windows.",
      "Full backup, calendar (.ics) and tasks (.csv) now open a Save window on Windows and Android, so you choose where the file goes. Keys and sign-in tokens are left out of backups.",
    ],
  },
  {
    version: "0.2.3",
    title: "Send email, Subscriptions and more",
    points: [
      "Write, reply and forward email from Outlook, Gmail and Bigpond, with Undo send, Send later and drafts from Claude or Gemini. The email page has a new tabs-on-top layout with search, avatars and date groups (switch back to Classic any time).",
      "New Subscriptions page: import a bank statement (CSV, OFX or QIF) and it finds what you pay for, sorts it into categories and guides you through cancelling. Right-click a newsletter to Unsubscribe.",
      "Mail alerts are silent unless you turn the sound on, with quick Not important and Mute buttons on Home. Shopping has a History tab, and the assistant can use Gemini.",
    ],
  },
  {
    version: "0.2.2",
    title: "Outlook / Hotmail sign-in fixed",
    points: [
      "Fixed the Outlook / Hotmail sign-in error AADSTS90023: the app now makes Microsoft's token request itself, the way a desktop app should.",
    ],
  },
  {
    version: "0.2.1",
    title: "Reorder the menu, better full screen",
    points: [
      "The left menu items are numbered: press 1-9 or 0 to jump to one, and drag them (or Alt+Up / Alt+Down) to put them where you want.",
      "Press F (or F11) for full screen, Esc to leave. It now hides the title bar by maximising the window (the old mode stopped the mouse working on some displays). To hide the taskbar too, turn it on in Settings → Looks.",
      "Sports games no longer appear on the Tasks page. They stay in the Calendar.",
    ],
  },
  {
    version: "0.2.0",
    title: "Updates install themselves, and a Sports calendar",
    points: [
      "The Windows app now downloads and installs updates by itself when it starts, then restarts. No more GitHub page.",
      "Sports opens on a week or month calendar of upcoming games, with a list view and a filter by team. Full screen (F11) hides the title bar, and the app opens on Home.",
      "Settings now suggest values: server settings for Bigpond and other mail, device names, your town, news topics, popular teams, and links to where each key comes from.",
    ],
  },
  {
    version: "0.1.9",
    title: "Gmail, Bigpond and other email",
    points: [
      "Add a Gmail account, or any other mailbox (Bigpond / Telstra, Yahoo, iCloud and more) from Settings → Email.",
      "They get the same junk and subscription filtering, important-mail alerts, rules and Bills tab as Outlook.",
      "Read-only: nothing is sent, moved or deleted in your mailbox.",
    ],
  },
  {
    version: "0.1.8",
    title: "Setup guides built in",
    points: [
      "A “Step-by-step setup guide” button in the setup wizard and Settings walks you through connecting Google (Drive and Calendar) and Outlook.",
      "Each step has a button that opens the exact Google or Microsoft page, with separate steps for your PC and your phone.",
      "Fixed phone sign-in to Google Drive: sync now uses a “Calendar Assistant (sync)” folder in your Drive.",
    ],
  },
  {
    version: "0.1.7",
    title: "Your phone joins Drive sync",
    points: [
      "On Android, sign in to Google Drive with a short code (google.com/device) and your phone syncs through the same Drive folder as your PC.",
      "It syncs when the app opens, every few minutes while it's running, and soon after you change something.",
    ],
  },
  {
    version: "0.1.6",
    title: "Sync through Google Drive",
    points: [
      "Settings → Phone & sync → Sync through Google Drive: devices share your calendar and lists through a Drive folder, with no server to run.",
      "It syncs when the app opens, every few minutes, and soon after you change something.",
      "A bar warns you if your calendar may be out of date, and a check makes sure every device matches.",
    ],
  },
  {
    version: "0.1.5",
    title: "Email arrives (Outlook)",
    points: [
      "A new Email page for Outlook and Hotmail, with junk and subscriptions kept out of the way. Needs your free Microsoft app ID (docs/EMAIL_SETUP.md).",
      "Important mail shows on Home with alerts, an unread count and a morning summary. Make your own rules: always notify, treat as important, or mute.",
      "A Bills tab shows amounts and due dates, with Mark as paid, Calendar and task buttons, and reminders before they're due.",
    ],
  },

  {
    version: "0.1.4",
    title: "A summary after every update",
    points: [
      "This window now appears once after an update, with the highlights.",
      "Settings → Updates → What's new shows it again any time.",
      "New looks: OLED dark, Forest and High-contrast themes, and a roomier Spacious density.",
    ],
  },
  {
    version: "0.1.3",
    title: "Google Calendar sync in one click",
    points: [
      "Settings → Sync with Google Calendar signs you in and syncs in one step, then keeps syncing when the app opens and every 5 to 60 minutes.",
      "Events deleted in Google now disappear here too, and deleting one occurrence of a repeating event carries over both ways.",
      "Syncs are faster (only what changed) and keep going if one event fails.",
    ],
  },
  {
    version: "0.1.2",
    title: "Repairs itself on broken PCs",
    points: [
      "If Windows' web component (WebView2) is damaged or blocked, the app explains why and offers to repair it, or to open in your browser instead.",
      "Common errors are now fixed automatically, with a plain-English explanation.",
    ],
  },
  {
    version: "0.1.1",
    title: "Clearer problems, smoother start",
    points: [
      "Crash reports in plain English, with a link to the fix.",
      "Checks for missing Windows parts when the app starts.",
      "The day and week views open at the current time.",
    ],
  },
];

/** The last version before this field existed: someone with no saved version is updating from it. */
const BASELINE = "0.1.2";
const MAX_ENTRIES = 3;

/** Entries newer than what the person last saw, up to and including the running version. */
export function entriesToShow(lastSeen: string | undefined, current: string): WhatsNewEntry[] {
  const from = lastSeen || BASELINE;
  return WHATS_NEW.filter((e) => newer(e.version, from) && !newer(e.version, current)).slice(0, MAX_ENTRIES);
}

export const useWhatsNew = create<{ entries: WhatsNewEntry[] }>(() => ({ entries: [] }));
