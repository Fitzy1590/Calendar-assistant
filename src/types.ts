export type ID = string;

/** Every synced record carries an id, a last-modified stamp and a tombstone flag. */
export interface Synced {
  id: ID;
  updatedAt: number;
  deleted?: boolean;
}

export type Freq = "daily" | "weekly" | "monthly" | "yearly";

export interface Recurrence {
  freq: Freq;
  interval: number; // every N units
  byWeekday?: number[]; // 0=Sun..6=Sat, weekly only
  until?: string; // yyyy-mm-dd inclusive
  count?: number;
}

export interface CalEvent extends Synced {
  title: string;
  start: string; // ISO local datetime "2026-11-07T09:00"
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  color?: string;
  recurrence?: Recurrence;
  exceptions?: string[]; // yyyy-mm-dd dates skipped in a series
  reminderMins?: number[];
  source?: "manual" | "email" | "assistant" | "sports" | "google";
  googleId?: string; // id of the linked Google Calendar event (two-way sync)
  googleEtag?: string;
}

export type Priority = "low" | "med" | "high";

export interface Task extends Synced {
  title: string;
  due?: string; // yyyy-mm-dd
  time?: string; // HH:mm
  done: boolean;
  doneAt?: number;
  priority: Priority;
  notes?: string;
  estimateMins?: number;
  ignored?: boolean; // parked: excluded from overdue nags
  carryPromptedOn?: string; // yyyy-mm-dd the carry-over prompt was last answered
}

export interface Contact extends Synced {
  name: string;
  phone?: string;
  email?: string;
  birthday?: string; // yyyy-mm-dd, year may be 1900 when unknown
  notes?: string;
  favourite?: boolean;
}

export type NoteColor = "yellow" | "mint" | "sky" | "rose" | "lilac" | "sand";

export interface Note extends Synced {
  title: string;
  body: string; // plain text; lines starting "[ ] " / "[x] " render as checkboxes
  color: NoteColor;
  pinned?: boolean;
  archived?: boolean;
  order: number; // manual sort position on the board
  tags?: string[];
}

export interface Feedback extends Synced {
  kind: "idea" | "bug" | "praise";
  text: string;
}

export type CollectionName = "events" | "tasks" | "contacts" | "notes" | "feedback";
export type RecordOf<C extends CollectionName> = C extends "events"
  ? CalEvent
  : C extends "tasks"
    ? Task
    : C extends "contacts"
      ? Contact
      : C extends "notes"
        ? Note
        : Feedback;

export interface Place {
  name: string; // suburb / locality
  city?: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
  timezone?: string;
}

export interface FavTeam {
  id: string;
  name: string;
  sport: string;
  league?: string;
  badge?: string;
}

export type ThemeName = "paper" | "ink" | "slate" | "sand" | "system";
export type PageId =
  | "home"
  | "calendar"
  | "tasks"
  | "contacts"
  | "notes"
  | "reminders"
  | "news"
  | "sports"
  | "settings";

export interface HomeWidget {
  id: "weather" | "clock" | "minical" | "agenda" | "tasks" | "birthdays" | "headlines" | "sports" | "localEvents" | "notes";
  visible: boolean;
}

export interface Settings {
  onboarded: boolean;
  setupSkipped: string[]; // wizard steps skipped, offered again from Home
  displayName: string;
  theme: ThemeName;
  accent: string;
  density: "compact" | "comfortable";
  fontScale: number;
  location?: Place;
  units: "metric" | "imperial";
  clock24: boolean;
  weekStartsOn: 0 | 1;
  newsCategories: string[];
  newsKeywords: string[];
  newsRegion: string; // e.g. "AU:en"
  sports: string[];
  teams: FavTeam[];
  sportsApiKey: string;
  reminders: {
    events: boolean;
    birthdays: boolean;
    tasks: boolean;
    birthdayDaysBefore: number;
    defaultEventMins: number;
    desktopNotifications: boolean;
  };
  sync: {
    enabled: boolean;
    serverUrl: string;
    pairingCode: string;
    deviceName: string;
  };
  phone: {
    route: "companion" | "phonelink"; // how the Windows app reaches the Android phone
  };
  voice: {
    wakeWord: boolean; // listen for the wake word while the app is open
    engine: "picovoice" | "browser"; // on-device (Picovoice) or the browser's speech service
    picovoiceKey: string; // free AccessKey from console.picovoice.ai; kept out of backups
    keyword: string; // "custom" or a built-in keyword name
    customKeyword?: { label: string; base64: string }; // "Hey Planner" .ppn trained in Picovoice Console
    sensitivity: number;
    chime: boolean;
    closeToTray: boolean; // Windows: keep running (and listening) in the tray when the window is closed
  };
  assistant: {
    provider: "local" | "claude";
    apiKey: string;
    voiceLang: string;
    speakReplies: boolean;
  };
  email: {
    googleClientId: string; // "Web application" client: browser / dev builds
    googleDesktopClientId: string; // "Desktop app" client: installed Windows app (loopback sign-in)
    googleDesktopClientSecret: string; // Google treats desktop secrets as non-confidential; still kept out of backups
    microsoftClientId: string;
  };
  localEventsApiKey: string; // Ticketmaster Discovery key (optional)
  google: {
    calendarSync: boolean; // two-way sync with Google Calendar
    calendarId: string; // usually "primary"
    lastCalendarSync?: number;
    driveBackup: boolean; // daily backup of data + settings to Google Drive (hidden app folder)
    lastDriveBackup?: number;
  };
  backup: {
    autoLocal: boolean; // rolling daily snapshots on this device
    lastLocal?: number;
  };
  sidebar: { id: PageId; visible: boolean }[];
  pages: {
    home: { widgets: HomeWidget[] };
    calendar: { view: "day" | "week" | "month" | "year"; showTasks: boolean; dayStartHour: number };
    tasks: { showDone: boolean; groupBy: "day" | "priority" };
    news: { layout: "list" | "cards"; showImages: boolean };
    notes: { layout: "board" | "list"; size: "s" | "m" | "l"; showArchived: boolean };
    sports: { resultsCount: number };
  };
}
