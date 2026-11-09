import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../store";
import { syncCalendarWith, type GoogleApi } from "./googleSync";

/** A tiny in-memory Google Calendar: enough of the Events API to run the sync against. */
function fakeGoogle() {
  let version = 0;
  const events = new Map<string, any>();
  const calls: string[] = [];
  const stamp = (e: any) => Object.assign(e, { _v: ++version, etag: `"e${version}"`, updated: new Date().toISOString() });
  const api: GoogleApi = async (url, init) => {
    const method = init?.method ?? "GET";
    const u = new URL(url);
    const id = u.pathname.split("/events/")[1];
    calls.push(`${method} ${id ?? "list"}`);
    if (method === "GET") {
      const tok = u.searchParams.get("syncToken");
      if (tok && !/^t\d+$/.test(tok)) return null; // 410: unknown / expired token
      const since = tok ? Number(tok.slice(1)) : -1;
      const items = [...events.values()].filter((e) => e._v > since && (tok || e.status !== "cancelled"));
      return { items: structuredClone(items), nextSyncToken: `t${version}` };
    }
    if (method === "POST") {
      const e = stamp({ id: `g${events.size + 1}`, status: "confirmed", ...JSON.parse(init!.body as string) });
      events.set(e.id, e);
      return structuredClone(e);
    }
    const cur = events.get(id);
    if (!cur || cur.status === "cancelled") throw new Error("Google 404: not found");
    if (method === "DELETE") {
      cur.status = "cancelled";
      stamp(cur);
      return null;
    }
    Object.assign(cur, JSON.parse(init!.body as string));
    stamp(cur);
    return structuredClone(cur);
  };
  return { api, events, calls, add: (e: any) => (events.set(e.id, stamp({ status: "confirmed", ...e })), e), stamp };
}

const sync = (api: GoogleApi) => syncCalendarWith(api);
const local = () => Object.values(useStore.getState().events);
const live = () => local().filter((e) => !e.deleted);
const tick = () => vi.setSystemTime(Date.now() + 5000); // local edits must be newer than the last sync

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T09:00:00"));
  useStore.setState({ events: {} });
  useStore.getState().updateSettings((s) => {
    s.google = {
      ...s.google,
      calendarSync: true,
      calendarId: "primary",
      syncToken: undefined,
      lastCalendarSync: undefined,
      lastCalendarSyncAt: undefined,
    };
  });
});
afterEach(() => vi.useRealTimers());

const dentist = { id: "g1", summary: "Dentist", start: { dateTime: "2026-11-12T10:00:00" }, end: { dateTime: "2026-11-12T11:00:00" } };
const gym = {
  id: "g2",
  summary: "Gym",
  start: { dateTime: "2026-11-09T18:00:00" },
  end: { dateTime: "2026-11-09T19:00:00" },
  recurrence: ["RRULE:FREQ=DAILY;INTERVAL=1"],
};

describe("Google Calendar sync", () => {
  it("pulls Google events, pushes local ones, and a second run changes nothing", async () => {
    const g = fakeGoogle();
    g.add(dentist);
    useStore.getState().upsert("events", { title: "Lunch", start: "2026-11-11T12:00", end: "2026-11-11T13:00", allDay: false });
    expect(await sync(g.api)).toContain("1 in, 1 out");
    expect(
      live()
        .map((e) => e.title)
        .sort(),
    ).toEqual(["Dentist", "Lunch"]);
    expect(live().every((e) => e.googleId)).toBe(true);
    expect([...g.events.values()].map((e) => e.summary).sort()).toEqual(["Dentist", "Lunch"]);
    g.calls.length = 0;
    tick();
    expect(await sync(g.api)).toContain("0 in, 0 out");
    expect(g.calls).toEqual(["GET list"]); // only the "what changed" request, nothing pushed back
  });

  it("removes an event here when it is deleted in Google, without deleting it again there", async () => {
    const g = fakeGoogle();
    g.add(dentist);
    await sync(g.api);
    tick();
    g.events.get("g1").status = "cancelled";
    g.stamp(g.events.get("g1"));
    g.calls.length = 0;
    expect(await sync(g.api)).toContain("1 removed");
    expect(live()).toHaveLength(0);
    expect(g.calls).toEqual(["GET list"]);
  });

  it("deletes in Google what is deleted here", async () => {
    const g = fakeGoogle();
    g.add(dentist);
    await sync(g.api);
    tick();
    useStore.getState().remove("events", live()[0].id);
    await sync(g.api);
    expect(g.events.get("g1").status).toBe("cancelled");
  });

  it("sends a deleted single occurrence to Google as an EXDATE", async () => {
    const g = fakeGoogle();
    g.add(gym);
    await sync(g.api);
    tick();
    const e = live()[0];
    useStore.getState().upsert("events", { id: e.id, exceptions: ["2026-11-11"] });
    await sync(g.api);
    expect(g.events.get("g2").recurrence[1]).toMatch(/^EXDATE;TZID=.+:20261111T180000$/);
  });

  it("turns a cancelled occurrence in Google into an exception, keeping the series", async () => {
    const g = fakeGoogle();
    g.add(gym);
    await sync(g.api);
    tick();
    g.add({ id: "g2_20261111", status: "cancelled", recurringEventId: "g2", originalStartTime: { dateTime: "2026-11-11T18:00:00" } });
    g.calls.length = 0;
    await sync(g.api);
    const series = live().find((e) => e.googleId === "g2")!;
    expect(series.exceptions).toEqual(["2026-11-11"]);
    expect(live()).toHaveLength(1);
    expect(g.calls).toEqual(["GET list"]); // not echoed back
  });

  it("keeps a moved occurrence as its own event and skips the original date in the series", async () => {
    const g = fakeGoogle();
    g.add(gym);
    await sync(g.api);
    tick();
    g.add({
      id: "g2_20261111",
      summary: "Gym (late)",
      recurringEventId: "g2",
      originalStartTime: { dateTime: "2026-11-11T18:00:00" },
      start: { dateTime: "2026-11-11T20:00:00" },
      end: { dateTime: "2026-11-11T21:00:00" },
    });
    await sync(g.api);
    expect(live().find((e) => e.googleId === "g2")!.exceptions).toEqual(["2026-11-11"]);
    expect(live().find((e) => e.googleId === "g2_20261111")!.title).toBe("Gym (late)");
  });

  it("starts over when Google drops the sync token, without duplicating anything", async () => {
    const g = fakeGoogle();
    g.add(dentist);
    await sync(g.api);
    useStore.getState().updateSettings((s) => void (s.google.syncToken = "expired"));
    tick();
    await sync(g.api);
    expect(live()).toHaveLength(1);
    expect(useStore.getState().settings.google.syncToken).toMatch(/^t\d+$/);
  });

  it("unlinks (does not delete) an event Google doesn't have, then creates it again", async () => {
    const g = fakeGoogle();
    useStore
      .getState()
      .upsert("events", { title: "Lunch", start: "2026-11-11T12:00", end: "2026-11-11T13:00", allDay: false, googleId: "other-account" });
    await sync(g.api);
    expect(live()).toHaveLength(1);
    expect(live()[0].googleId).toBeUndefined();
    tick();
    await sync(g.api);
    expect(live()[0].googleId).toBeTruthy();
  });

  it("merges two local copies of one Google event without deleting it in Google", async () => {
    const g = fakeGoogle();
    g.add(dentist);
    await sync(g.api);
    const copy = { ...live()[0], id: "dup", updatedAt: Date.now() + 1 };
    useStore.setState({ events: { ...useStore.getState().events, dup: copy } });
    tick();
    g.calls.length = 0;
    await sync(g.api);
    expect(live()).toHaveLength(1);
    expect(g.events.get("g1").status).toBe("confirmed");
    expect(g.calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });

  it("keeps going when one event fails, retries it next time, and says so", async () => {
    const g = fakeGoogle();
    useStore.getState().upsert("events", { title: "A", start: "2026-11-11T12:00", end: "2026-11-11T13:00", allDay: false });
    useStore.getState().upsert("events", { title: "B", start: "2026-11-11T14:00", end: "2026-11-11T15:00", allDay: false });
    let n = 0;
    const flaky: GoogleApi = async (url, init) => {
      if (init?.method === "POST" && ++n === 1) throw new Error("Google 500: boom");
      return g.api(url, init);
    };
    expect(await sync(flaky)).toContain("1 failed");
    expect(g.events.size).toBe(1);
    tick();
    await sync(g.api);
    expect(g.events.size).toBe(2);
  });

  it("stops and reports when Google refuses access", async () => {
    const denied: GoogleApi = async () => {
      throw new Error("Google 401: invalid credentials");
    };
    await expect(sync(denied)).rejects.toThrow("401");
    expect(useStore.getState().settings.google.lastCalendarSyncError).toContain("401");
  });
});
