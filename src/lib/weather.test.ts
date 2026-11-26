import { describe, expect, it } from "vitest";
import { describeDay, meanHumidityByDate, type DayWeather } from "./weather";

const day = (over: Partial<DayWeather> = {}): DayWeather => ({
  date: "2026-11-28",
  code: 0,
  max: 20,
  min: 16,
  rainChance: 10,
  rainMm: 0,
  uv: 3,
  wind: 10,
  sunrise: "2026-11-28T06:00",
  sunset: "2026-11-28T20:00",
  ...over,
});

describe("meanHumidityByDate", () => {
  it("averages the hourly readings of each day and rounds", () => {
    const times = ["2026-11-28T00:00", "2026-11-28T01:00", "2026-11-28T02:00", "2026-11-29T00:00"];
    const m = meanHumidityByDate(times, [60, 70, 65, 40]);
    expect(m.get("2026-11-28")).toBe(65);
    expect(m.get("2026-11-29")).toBe(40);
  });
  it("skips missing readings and leaves out a day with none", () => {
    const m = meanHumidityByDate(["2026-11-28T00:00", "2026-11-28T01:00", "2026-11-29T00:00"], [50, null, undefined]);
    expect(m.get("2026-11-28")).toBe(50);
    expect(m.has("2026-11-29")).toBe(false);
  });
  it("copes with no humidity series at all", () => {
    expect(meanHumidityByDate(["2026-11-28T00:00"], []).size).toBe(0);
  });
});

describe("describeDay", () => {
  it("includes humidity when it is known", () => {
    expect(describeDay(day({ humidity: 62 }), "metric")).toBe("Clear, 16–20°C, humidity 62%");
  });
  it("leaves it out when it is not", () => {
    expect(describeDay(day(), "metric")).toBe("Clear, 16–20°C");
  });
});
