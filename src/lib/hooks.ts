import { useEffect, useState } from "react";
import { useStore } from "../store";
import { getForecast, type Forecast } from "./weather";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    set((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => live && set({ data, loading: false }),
      (e) => live && set({ error: String(e?.message ?? e), loading: false }),
    );
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useForecast(): { data?: Forecast; error?: string; loading: boolean } {
  const loc = useStore((s) => s.settings.location);
  const units = useStore((s) => s.settings.units);
  return useAsync(() => (loc ? getForecast(loc, units) : Promise.reject(new Error("No location set"))), [loc?.lat, loc?.lon, units]);
}

export function useNow(intervalMs = 1000) {
  const [now, set] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => set(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
