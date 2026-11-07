import type { Place } from "../types";
import { cached, getJson } from "./http";

export interface LocalEvent {
  id: string;
  name: string;
  url: string;
  venue?: string;
  start: string;
  image?: string;
  category?: string;
}

/**
 * Local happenings for a day near the saved location.
 * With a Ticketmaster Discovery key (free at developer.ticketmaster.com) we list real events;
 * without one we still offer search links so the panel is never empty.
 */
export async function localEventsFor(place: Place, day: string, apiKey: string): Promise<LocalEvent[]> {
  if (!apiKey) return [];
  return cached(`le:${place.lat},${place.lon}:${day}`, 60 * 60e3, async () => {
    const url =
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}` +
      `&latlong=${place.lat},${place.lon}&radius=30&unit=km&size=20&sort=date,asc` +
      `&startDateTime=${day}T00:00:00Z&endDateTime=${day}T23:59:59Z`;
    const j = await getJson<any>(url);
    return (j._embedded?.events ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      url: e.url,
      venue: e._embedded?.venues?.[0]?.name,
      start: e.dates?.start?.localTime ? `${day}T${e.dates.start.localTime}` : day,
      image: e.images?.find((i: any) => i.ratio === "16_9")?.url,
      category: e.classifications?.[0]?.segment?.name,
    }));
  });
}

export function localSearchLinks(place: Place, dayLabel: string) {
  const suburb = place.name;
  const city = place.city || place.region || "";
  const q = (where: string) => encodeURIComponent(`events in ${where} ${dayLabel}`);
  return [
    { label: `What's on in ${suburb}`, url: `https://www.google.com/search?q=${q(suburb)}` },
    ...(city && city !== suburb ? [{ label: `What's on in ${city}`, url: `https://www.google.com/search?q=${q(city)}` }] : []),
    { label: "Eventbrite nearby", url: `https://www.eventbrite.com/d/${encodeURIComponent((city || suburb).toLowerCase())}/events/` },
  ];
}
