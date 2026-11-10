import { addMinutes } from "date-fns";
import { parseWhen } from "../nlp";

/** Dates and times mentioned in an email, as ideas for calendar events and deadlines. Local: nothing is sent anywhere. */

export interface DateIdea {
  title: string; // the sentence it came from
  start: Date;
  end: Date;
  allDay: boolean;
}

const sentences = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6 && s.length < 240);

/** Up to `max` future dates found in the text, earliest first. A sentence with a time becomes a 1-hour event; with only a day, an all-day one. */
export function dateIdeas(text: string, now = new Date(), max = 3): DateIdea[] {
  const out: DateIdea[] = [];
  const seen = new Set<string>();
  for (const s of sentences(text)) {
    const w = parseWhen(s, now);
    if (!w.date) continue;
    const day = new Date(w.date);
    const hasTime = w.hour !== undefined;
    const start = hasTime ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), w.hour!, w.minute ?? 0) : day;
    if (start.getTime() < now.getTime() - 3600e3) continue;
    const key = start.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: s.replace(/\s+/g, " ").slice(0, 90),
      start,
      end: hasTime ? addMinutes(start, w.durationMins ?? 60) : addMinutes(start, 24 * 60),
      allDay: !hasTime,
    });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, max);
}
