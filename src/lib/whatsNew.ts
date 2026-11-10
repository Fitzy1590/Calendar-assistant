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
