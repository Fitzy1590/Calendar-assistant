import { addDays, addMonths, addWeeks, nextDay, startOfDay, type Day } from "date-fns";
import type { Recurrence } from "../types";

/**
 * Small, dependency-free natural language date parser for assistant commands.
 * Handles: today/tonight/tomorrow, weekday names ("friday", "next tue"), "in 3 days",
 * "on 12 March", "March 12", "12/3" (day-first), times ("at 3pm", "15:30", "noon"),
 * durations ("for 2 hours", "for 45 min"), and "this week"/"next week" ranges.
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WD_RE = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|urday|sday)?";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";

export interface When {
  date?: Date; // day (00:00) when a date was found
  hour?: number;
  minute?: number;
  durationMins?: number;
  range?: { from: Date; to: Date };
  rest: string; // input with the date/time phrases removed
}

function wdIndex(token: string) {
  const t = token.slice(0, 3);
  return WEEKDAYS.findIndex((w) => w.startsWith(t));
}

export function parseWhen(input: string, now = new Date()): When {
  let s = " " + input.toLowerCase() + " ";
  // matching runs on lower case; the same spans are cut from the original so titles keep their capitals
  let orig = " " + input + " ";
  if (orig.length !== s.length) orig = s; // rare letters whose lower case changes length: fall back
  const res: When = { rest: input };
  const today = startOfDay(now);
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m && m.index !== undefined) {
      fn(m);
      const a = m.index;
      const b = a + m[0].length;
      s = s.slice(0, a) + " " + s.slice(b);
      orig = orig.slice(0, a) + " " + orig.slice(b);
    }
    return !!m;
  };

  // ranges first
  take(/\b(this|next) week\b/, (m) => {
    if (m[1] === "this") {
      res.range = { from: today, to: addDays(today, 7) }; // "this week" = the coming seven days
    } else {
      const base = addWeeks(today, 1);
      const monday = addDays(base, -((base.getDay() + 6) % 7));
      res.range = { from: monday, to: addDays(monday, 7) };
    }
  });
  take(/\b(?:this )?weekend\b/, () => {
    const sat = today.getDay() === 6 ? today : nextDay(today, 6);
    res.range = { from: today.getDay() === 0 ? today : sat, to: addDays(sat, 2) };
  });

  // dates
  take(/\b(today|tonight|this evening|this morning|this afternoon)\b/, (m) => {
    res.date = today;
    if (m[1] === "tonight" || m[1] === "this evening") res.hour ??= 19;
  });
  take(/\b(tomorrow|tmrw|tmr)\b/, () => (res.date = addDays(today, 1)));
  take(/\byesterday\b/, () => (res.date = addDays(today, -1)));
  take(/\bday after tomorrow\b/, () => (res.date = addDays(today, 2)));
  take(/\bin (\d+) (day|days|week|weeks|month|months)\b/, (m) => {
    const n = +m[1];
    res.date = m[2].startsWith("day") ? addDays(today, n) : m[2].startsWith("week") ? addWeeks(today, n) : addMonths(today, n);
  });
  if (!res.date)
    take(new RegExp(`\\b(?:on |this |next )?${WD_RE}\\b`), (m) => {
      const idx = wdIndex(m[1]);
      const isNext = /next/.test(m[0]);
      let d = today.getDay() === idx ? today : nextDay(today, idx as Day);
      if (isNext && today.getDay() === idx) d = addDays(today, 7);
      res.date = d;
    });
  if (!res.date)
    take(new RegExp(`\\b(?:on )?(?:the )?(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MON_RE}(?: (\\d{4}))?\\b`), (m) => {
      res.date = mkDate(+m[1], monthIdx(m[2]), m[3], today);
    });
  if (!res.date)
    take(new RegExp(`\\b(?:on )?${MON_RE} (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?\\b`), (m) => {
      res.date = mkDate(+m[2], monthIdx(m[1]), m[3], today);
    });
  if (!res.date)
    take(/\b(?:on )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
      res.date = mkDate(+m[1], +m[2] - 1, m[3], today);
    });
  if (!res.date)
    take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => {
      res.date = new Date(+m[1], +m[2] - 1, +m[3]);
    });

  // durations before times so "for 2 hours" isn't read as 2 o'clock
  take(/\bfor (\d+(?:\.\d+)?) ?(hours?|hrs?|h|minutes?|mins?|m)\b/, (m) => {
    res.durationMins = Math.round(+m[1] * (m[2].startsWith("h") ? 60 : 1));
  });
  take(/\bfor (an|a|half an) hour\b/, (m) => (res.durationMins = m[1] === "half an" ? 30 : 60));

  // times
  take(/\b(noon|midday)\b/, () => ((res.hour = 12), (res.minute = 0)));
  take(/\bmidnight\b/, () => ((res.hour = 0), (res.minute = 0)));
  take(/\b(?:at |@ ?)?(\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a\.m\.|p\.m\.)\b/, (m) => {
    let h = +m[1] % 12;
    if (m[3].startsWith("p")) h += 12;
    res.hour = h;
    res.minute = m[2] ? +m[2] : 0;
  });
  if (res.hour === undefined)
    take(/\b(?:at |@ ?)(\d{1,2})(?:[:.](\d{2}))?\b/, (m) => {
      let h = +m[1];
      if (h >= 1 && h <= 7) h += 12; // "at 3" almost always means afternoon
      res.hour = h;
      res.minute = m[2] ? +m[2] : 0;
    });
  if (res.hour === undefined)
    take(/\b([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => ((res.hour = +m[1]), (res.minute = +m[2])));
  take(/\b(in the )?(morning|afternoon|evening)\b/, (m) => {
    res.hour ??= m[2] === "morning" ? 9 : m[2] === "afternoon" ? 14 : 18;
    res.minute ??= 0;
  });

  if (res.hour !== undefined && !res.date) {
    // a bare time means the next time that clock time occurs
    const t = new Date(today);
    t.setHours(res.hour, res.minute ?? 0);
    res.date = t < now ? addDays(today, 1) : today;
  }

  res.rest = orig.replace(/\s+/g, " ").replace(/\b(on|at|for|from)\s*$/i, "").trim();
  return res;
}

function monthIdx(token: string) {
  return MONTHS.indexOf(token.slice(0, 3));
}

function mkDate(day: number, month: number, year: string | undefined, today: Date) {
  let y = year ? +year : today.getFullYear();
  if (y < 100) y += 2000;
  let d = new Date(y, month, day);
  if (!year && d < today) d = new Date(y + 1, month, day); // "12 March" in November = next March
  return d;
}

/** "every day", "every 2 weeks", "every monday and thursday", "weekdays", "monthly", "every year" */
export function parseRecurrence(input: string): { recurrence?: Recurrence; rest: string } {
  let s = " " + input.toLowerCase() + " ";
  let recurrence: Recurrence | undefined;
  const m1 = s.match(/\b(?:every|each) (other |\d+ )?(day|week|month|year|fortnight)s?\b/);
  if (m1) {
    const n = m1[1]?.trim() === "other" ? 2 : m1[1] ? parseInt(m1[1]) : 1;
    const unit = m1[2];
    recurrence =
      unit === "fortnight"
        ? { freq: "weekly", interval: 2 }
        : { freq: ({ day: "daily", week: "weekly", month: "monthly", year: "yearly" } as const)[unit as "day"], interval: n };
    s = s.replace(m1[0], " ");
  }
  const days = new RegExp(`\\b(?:every|each|on) ((?:${WD_RE}(?:s)?(?:,? (?:and )?)?)+)`);
  const m2 = s.match(days);
  if (m2 && (!recurrence || recurrence.freq === "weekly") && /every|each/.test(m2[0])) {
    const list = m2[1].match(new RegExp(WD_RE, "g")) ?? [];
    recurrence = { freq: "weekly", interval: recurrence?.interval ?? 1, byWeekday: list.map(wdIndex) };
    s = s.replace(m2[0], " ");
  }
  if (!recurrence && /\b(weekdays|every weekday)\b/.test(s)) {
    recurrence = { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] };
    s = s.replace(/\b(on )?(every )?weekdays?\b/, " ");
  }
  if (!recurrence) {
    const m3 = s.match(/\b(daily|weekly|monthly|yearly|annually|fortnightly)\b/);
    if (m3) {
      const map: Record<string, Recurrence> = {
        daily: { freq: "daily", interval: 1 },
        weekly: { freq: "weekly", interval: 1 },
        fortnightly: { freq: "weekly", interval: 2 },
        monthly: { freq: "monthly", interval: 1 },
        yearly: { freq: "yearly", interval: 1 },
        annually: { freq: "yearly", interval: 1 },
      };
      recurrence = map[m3[1]];
      s = s.replace(m3[0], " ");
    }
  }
  const until = s.match(/\buntil (.+?)$/);
  if (recurrence && until) {
    const w = parseWhen(until[1]);
    if (w.date) {
      recurrence.until = `${w.date.getFullYear()}-${String(w.date.getMonth() + 1).padStart(2, "0")}-${String(w.date.getDate()).padStart(2, "0")}`;
      s = s.replace(until[0], " ");
    }
  }
  return { recurrence, rest: s.replace(/\s+/g, " ").trim() };
}

/** Strip filler words so "add a dentist appointment" becomes "Dentist appointment". */
export function cleanTitle(s: string) {
  const t = s
    .replace(/^(please |can you |could you |hey |ok )+/i, "")
    .replace(/^(add|create|schedule|book|put|set up|make|new)( an?| the| my)?( (event|appointment|meeting|task|todo|to-do|reminder))?( (for|called|named|titled))?\b/i, "")
    .replace(/\b(to|in|on|into) (my |the )?(calendar|diary|task list|tasks|list)\b/gi, "")
    .replace(/^(remind me to|remember to|i need to|i have to)\b/i, "")
    .replace(/^\s*(an?|the)\s+/i, "")
    .replace(/\s+(on|at|for|from|with)\s*$/i, "")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
