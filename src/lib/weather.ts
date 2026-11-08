import type { Place } from "../types";
import { cached, getJson } from "./http";

/** Open-Meteo: free, no key, CORS-enabled. https://open-meteo.com */

export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export function skyOf(code: number): { sky: Sky; label: string } {
  if (code === 0) return { sky: "clear", label: "Clear" };
  if (code <= 2) return { sky: "partly", label: code === 1 ? "Mostly clear" : "Partly cloudy" };
  if (code === 3) return { sky: "cloudy", label: "Overcast" };
  if (code === 45 || code === 48) return { sky: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { sky: "drizzle", label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { sky: "rain", label: code >= 80 ? "Showers" : "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { sky: "snow", label: "Snow" };
  if (code >= 95) return { sky: "storm", label: "Thunderstorms" };
  return { sky: "cloudy", label: "Cloudy" };
}

export interface DayWeather {
  date: string;
  code: number;
  max: number;
  min: number;
  rainChance: number;
  rainMm: number;
  uv: number;
  wind: number;
  sunrise: string;
  sunset: string;
}
export interface Forecast {
  current: { temp: number; feels: number; code: number; wind: number; humidity: number; isDay: boolean };
  hourly: { time: string; temp: number; code: number; rainChance: number }[];
  daily: DayWeather[];
  fetchedAt: number;
}

export async function getForecast(p: Place, units: "metric" | "imperial"): Promise<Forecast> {
  const u = units === "imperial" ? "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" : "";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&forecast_days=16` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day` +
    `&hourly=temperature_2m,weather_code,precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max,sunrise,sunset` +
    u;
  return cached(`wx:${p.lat},${p.lon}:${units}`, 15 * 60e3, async () => {
    const j = await getJson<any>(url);
    return {
      fetchedAt: Date.now(),
      current: {
        temp: j.current.temperature_2m,
        feels: j.current.apparent_temperature,
        code: j.current.weather_code,
        wind: j.current.wind_speed_10m,
        humidity: j.current.relative_humidity_2m,
        isDay: !!j.current.is_day,
      },
      hourly: j.hourly.time.map((t: string, i: number) => ({
        time: t,
        temp: j.hourly.temperature_2m[i],
        code: j.hourly.weather_code[i],
        rainChance: j.hourly.precipitation_probability[i] ?? 0,
      })),
      daily: j.daily.time.map((d: string, i: number) => ({
        date: d,
        code: j.daily.weather_code[i],
        max: j.daily.temperature_2m_max[i],
        min: j.daily.temperature_2m_min[i],
        rainChance: j.daily.precipitation_probability_max[i] ?? 0,
        rainMm: j.daily.precipitation_sum[i] ?? 0,
        uv: j.daily.uv_index_max[i] ?? 0,
        wind: j.daily.wind_speed_10m_max[i] ?? 0,
        sunrise: j.daily.sunrise[i],
        sunset: j.daily.sunset[i],
      })),
    };
  });
}

export async function searchPlaces(q: string): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const j = await getJson<any>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`,
  );
  return (j.results ?? []).map((r: any) => ({
    name: r.name,
    city: r.admin2 || r.admin1,
    region: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone,
  }));
}

/** Reverse-lookup the device position to the nearest named place (best effort). */
export async function placeFromDevice(): Promise<Place> {
  const pos = await new Promise<GeolocationPosition>((ok, err) =>
    navigator.geolocation.getCurrentPosition(ok, err, { timeout: 10000 }),
  );
  const { latitude: lat, longitude: lon } = pos.coords;
  try {
    const j = await getJson<any>(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`,
    );
    const a = j.address ?? {};
    return {
      name: a.suburb || a.town || a.village || a.city_district || a.city || "My location",
      city: a.city || a.town || a.county,
      region: a.state,
      country: a.country,
      lat,
      lon,
    };
  } catch {
    return { name: "My location", lat, lon };
  }
}

export const tempUnit = (units: "metric" | "imperial") => (units === "imperial" ? "°F" : "°C");

/** One-line plain-English summary used by the assistant and the day panel. */
export function describeDay(d: DayWeather, units: "metric" | "imperial") {
  const { label } = skyOf(d.code);
  const t = tempUnit(units);
  let s = `${label}, ${Math.round(d.min)}–${Math.round(d.max)}${t}`;
  if (d.rainChance >= 30) s += `, ${d.rainChance}% chance of rain`;
  if (d.uv >= 8) s += `, UV very high (${Math.round(d.uv)})`;
  return s;
}
