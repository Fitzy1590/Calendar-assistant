import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CollectionName, Contact, PageId, RecordOf, Settings, Synced } from "./types";
import { pairingCode, uid } from "./lib/util";
import { DEFAULT_MAIL_SETTINGS } from "./lib/mail/types";

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  setupSkipped: [],
  displayName: "",
  theme: "system",
  accent: "#2f5d8a",
  density: "comfortable",
  fontScale: 1,
  units: "metric",
  clock24: false,
  weekStartsOn: 1,
  newsCategories: ["TOP", "NATION", "TECHNOLOGY"],
  newsKeywords: [],
  newsRegion: "AU:en",
  sports: [],
  teams: [],
  sportsApiKey: "",
  reminders: {
    events: true,
    birthdays: true,
    tasks: true,
    birthdayDaysBefore: 3,
    defaultEventMins: 30,
    desktopNotifications: true,
  },
  invites: {
    template: "Hi {name}, want to catch up? {title} on {when}{where}.\n{rsvp}{maps}\n– {from}",
    channel: "ask",
    rsvpLinks: true,
    notifyReplies: true,
  },
  shopping: {
    radiusKm: 10,
    onlineStores: ["Amazon AU", "Officeworks", "Bunnings", "eBay AU", "JB Hi-Fi", "Kmart"],
    checkPricesDaily: true,
    notifyDrops: true,
  },
  updates: { checkOnLaunch: true, installAutomatically: false },
  sync: { shareSettings: true, enabled: false, serverUrl: "", pairingCode: pairingCode(), deviceName: "" },
  phone: { route: "companion" },
  assistant: { provider: "local", apiKey: "", voiceLang: "en-AU", speakReplies: false },
  email: {
    googleClientId: "",
    googleDesktopClientId: "",
    googleDesktopClientSecret: "",
    googleDeviceClientId: "",
    googleDeviceClientSecret: "",
    microsoftClientId: "",
  },
  voice: { wakeWord: false, engine: "picovoice", picovoiceKey: "", keyword: "custom", sensitivity: 0.6, chime: true, closeToTray: true },
  localEventsApiKey: "",
  mail: DEFAULT_MAIL_SETTINGS,
  driveSync: { enabled: false, everyMins: 5, staleMins: 30, meta: { peers: {} } },
  google: { calendarSync: false, calendarId: "primary", driveBackup: false, syncEveryMins: 15 },
  backup: { autoLocal: true },
  sidebar: (
    ["home", "calendar", "email", "tasks", "notes", "shopping", "reminders", "contacts", "news", "sports", "settings"] as PageId[]
  ).map((id) => ({
    id,
    visible: true,
  })),
  pages: {
    home: {
      widgets: (
        ["weather", "clock", "minical", "agenda", "mail", "tasks", "notes", "localEvents", "birthdays", "headlines", "sports"] as const
      ).map((id) => ({ id, visible: true })),
    },
    calendar: { view: "week", showTasks: true, showBirthdays: true, dayStartHour: 7 },
    tasks: { showDone: false, groupBy: "day" },
    news: { layout: "list", showImages: false },
    notes: { layout: "board", size: "m", showArchived: false },
    sports: { resultsCount: 5 },
  },
};

export type Change = { collection: CollectionName; record: Synced };

type Coll<C extends CollectionName> = Record<string, RecordOf<C>>;

interface State {
  deviceId: string;
  settings: Settings;
  events: Coll<"events">;
  tasks: Coll<"tasks">;
  contacts: Coll<"contacts">;
  notes: Coll<"notes">;
  shopping: Coll<"shopping">;
  prefs: Coll<"prefs">;
  feedback: Coll<"feedback">;
  dismissedReminders: Record<string, number>; // reminder key -> dismissed at
  snoozedReminders: Record<string, number>; // reminder key -> snoozed until
  lastSyncSeq: number;

  page: PageId;
  selectedDay: string | null; // yyyy-mm-dd driving the day panel
  sportFocus: { kind: "sport" | "team"; id: string } | null;
  assistantOpen: boolean;
  feedbackOpen: boolean;
  emailImportOpen: boolean;
  wizardSteps: string[] | null; // re-open the wizard on just these steps
  toast: string | null;

  setPage: (p: PageId) => void;
  selectDay: (d: string | null) => void;
  setSportFocus: (f: State["sportFocus"]) => void;
  setUi: (p: Partial<Pick<State, "assistantOpen" | "feedbackOpen" | "emailImportOpen" | "wizardSteps" | "toast">>) => void;
  updateSettings: (fn: (s: Settings) => Settings | void) => void;
  upsert: <C extends CollectionName>(c: C, rec: Partial<RecordOf<C>> & { id?: string }) => RecordOf<C>;
  remove: (c: CollectionName, id: string) => void;
  applyRemote: (changes: Change[], seq?: number) => void;
  dismissReminder: (key: string) => void;
  snoozeReminder: (key: string, until: number) => void;
}

/** Listeners (the sync client) get every local change so they can push it to other devices. */
const listeners = new Set<(c: Change) => void>();
export const onLocalChange = (fn: (c: Change) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      deviceId: uid(),
      settings: DEFAULT_SETTINGS,
      events: {},
      tasks: {},
      contacts: {},
      notes: {},
      shopping: {},
      prefs: {},
      feedback: {},
      dismissedReminders: {},
      snoozedReminders: {},
      lastSyncSeq: 0,
      page: "home",
      selectedDay: null,
      sportFocus: null,
      assistantOpen: false,
      feedbackOpen: false,
      emailImportOpen: false,
      wizardSteps: null,
      toast: null,

      setPage: (page) => set({ page }),
      selectDay: (selectedDay) => set({ selectedDay }),
      setSportFocus: (sportFocus) => set({ sportFocus, page: "sports" }),
      setUi: (p) => set(p),
      updateSettings: (fn) =>
        set((s) => {
          const draft = structuredClone(s.settings);
          const out = fn(draft) ?? draft;
          return { settings: out };
        }),
      upsert: (c, rec) => {
        const prev = rec.id ? (get()[c] as Record<string, Synced>)[rec.id] : undefined;
        const next = { ...(prev ?? {}), ...rec, id: rec.id ?? uid(), updatedAt: Date.now() } as RecordOf<typeof c>;
        set((s) => ({ [c]: { ...(s[c] as object), [next.id]: next } }) as Partial<State>);
        listeners.forEach((l) => l({ collection: c, record: next }));
        return next;
      },
      remove: (c, id) => {
        const prev = (get()[c] as Record<string, Synced>)[id];
        if (!prev) return;
        // tombstone instead of delete so the removal syncs to other devices
        const next = { ...prev, deleted: true, updatedAt: Date.now() };
        set((s) => ({ [c]: { ...(s[c] as object), [id]: next } }) as Partial<State>);
        listeners.forEach((l) => l({ collection: c, record: next }));
      },
      applyRemote: (changes, seq) =>
        set((s) => {
          const patch: Partial<State> = {};
          for (const { collection, record } of changes) {
            const coll = { ...((patch[collection] ?? s[collection]) as Record<string, Synced>) };
            const cur = coll[record.id];
            if (!cur || cur.updatedAt <= record.updatedAt) coll[record.id] = record; // last writer wins
            (patch as Record<string, unknown>)[collection] = coll;
          }
          if (seq !== undefined) patch.lastSyncSeq = Math.max(s.lastSyncSeq, seq);
          return patch;
        }),
      dismissReminder: (key) => set((s) => ({ dismissedReminders: { ...s.dismissedReminders, [key]: Date.now() } })),
      snoozeReminder: (key, until) => set((s) => ({ snoozedReminders: { ...s.snoozedReminders, [key]: until } })),
    }),
    {
      name: "calendar-assistant",
      version: 1,
      partialize: (s) => ({
        deviceId: s.deviceId,
        settings: s.settings,
        events: s.events,
        tasks: s.tasks,
        contacts: s.contacts,
        notes: s.notes,
        shopping: s.shopping,
        prefs: s.prefs,
        feedback: s.feedback,
        dismissedReminders: s.dismissedReminders,
        snoozedReminders: s.snoozedReminders,
        lastSyncSeq: s.lastSyncSeq,
        page: s.page,
      }),
      // saved data that can't be read (damaged): restore the newest daily snapshot automatically
      onRehydrateStorage: () => (_state, error) => {
        // only when something was saved and couldn't be read; a brand-new install has nothing to restore
        let saved: string | null = null;
        try {
          saved = localStorage.getItem("calendar-assistant");
        } catch {
          /* storage unavailable */
        }
        if (!error || !saved) return;
        import("./lib/autofix").then(({ restoreFromSnapshot }) => {
          const did = restoreFromSnapshot();
          import("./lib/errors").then(({ recordError }) => recordError(error, "startup", false));
          if (did) setTimeout(() => toast(`Your saved data couldn't be read, so it was restored from the latest backup. ${did}`), 1500);
        });
      },
      // new settings keys added in later versions get their defaults
      merge: (persisted, current) => {
        if (!persisted) return current; // nothing saved yet (first launch)
        const p = persisted as Partial<State>;
        const settings = deepMerge(DEFAULT_SETTINGS, p.settings ?? {}) as Settings;
        // pages and widgets added in later versions are appended to saved lists
        for (const d of DEFAULT_SETTINGS.sidebar)
          if (!settings.sidebar.some((x) => x.id === d.id)) settings.sidebar.splice(-1, 0, { ...d });
        for (const d of DEFAULT_SETTINGS.pages.home.widgets)
          if (!settings.pages.home.widgets.some((x) => x.id === d.id)) settings.pages.home.widgets.push({ ...d });
        return { ...current, ...p, notes: p.notes ?? {}, shopping: p.shopping ?? {}, prefs: p.prefs ?? {}, settings };
      },
    },
  ),
);

function deepMerge(base: any, over: any): any {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return over ?? base;
  const out: any = { ...base };
  for (const k of Object.keys(over ?? {})) out[k] = deepMerge(base[k], over[k]);
  return out;
}

/** Live (non-deleted) records of a collection. */
export const live = <T extends Synced>(c: Record<string, T>) => Object.values(c).filter((r) => !r.deleted);

export const findContact = (name: string): Contact | undefined => {
  const q = name.toLowerCase().trim();
  const all = live(useStore.getState().contacts);
  return (
    all.find((c) => c.name.toLowerCase() === q) ||
    all.find((c) => c.name.toLowerCase().split(/\s+/)[0] === q) ||
    all.find((c) => c.name.toLowerCase().includes(q))
  );
};

export const toast = (msg: string) => {
  useStore.getState().setUi({ toast: msg });
  setTimeout(() => useStore.getState().toast === msg && useStore.getState().setUi({ toast: null }), 3500);
};
